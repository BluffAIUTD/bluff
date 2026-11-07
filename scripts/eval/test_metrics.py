import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from metrics import binary_counts, link_counts, merge_results, prf  # noqa: E402
from run_linker import naive_predict  # noqa: E402


class Metrics(unittest.TestCase):
    def test_prf_edge_cases(self):
        self.assertEqual(prf(0, 0, 0), {"p": 0.0, "r": 0.0, "f1": 0.0})
        self.assertEqual(prf(5, 0, 0)["f1"], 1.0)
        self.assertEqual(prf(1, 1, 1), {"p": 0.5, "r": 0.5, "f1": 0.5})

    def test_link_counts_semantics(self):
        pairs = [("a", "a"), ("b", "a"), (None, "a"), ("c", None), (None, None)]
        # TP: first. wrong link: FP+FN. missed: FN. link where none: FP. correct no-link: nothing.
        self.assertEqual(link_counts(pairs), (1, 2, 2))

    def test_binary_counts(self):
        self.assertEqual(binary_counts([(True, True), (True, False), (False, True), (False, False)]), (1, 1, 1, 1))

    def test_naive_baseline(self):
        ex = [{"id": "e1", "label": "fastkicks-shop"}, {"id": "e2", "label": "kitchenwiz-store"}]
        self.assertEqual(naive_predict("FASTKICKS SHOP 12", ex), "e1")
        self.assertIsNone(naive_predict("FKSHP*LLC", ex))  # the abbreviation case the baseline cannot solve
        self.assertEqual(naive_predict("sq *KITCHENWIZ", ex), "e2")

    def test_merge_preserves_other_claims(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "r.json")
            merge_results(p, "claimA", {"n": 1}, "t1")
            merge_results(p, "claimB", {"n": 2}, "t2")
            data = json.load(open(p))
            self.assertEqual(data["claimA"], {"n": 1})
            self.assertEqual(data["claimB"], {"n": 2})
            self.assertEqual(data["generated_at"], "t2")


if __name__ == "__main__":
    unittest.main()


class ClaimA(unittest.TestCase):
    def test_split_is_stratified_deterministic_and_disjoint(self):
        from prepare_split import split
        rows = [{"id": f"a{i}", "label": "scam"} for i in range(50)] + [{"id": f"b{i}", "label": "legit"} for i in range(50)]
        tr, te = split(rows)
        self.assertEqual((len(tr), len(te)), (80, 20))
        self.assertFalse(set(tr) & set(te))
        self.assertEqual(sum(1 for i in te if i.startswith("a")), 10)
        self.assertEqual(split(rows), (tr, te))

    def test_unsure_mapping_and_error_counted_wrong(self):
        from score import predicted_scam, score
        v = lambda x: {"ok": True, "verdict": {"verdict": x}}  # noqa: E731
        self.assertTrue(predicted_scam(v("unsure"), True))
        self.assertFalse(predicted_scam(v("unsure"), False))
        self.assertIsNone(predicted_scam({"ok": False}, True))
        rows = {"1": {"label": "scam"}, "2": {"label": "legit"}}
        b, base = score(rows, ["1", "2"], {"1": {"ok": False}, "2": v("looks_ok")}, {"1": True, "2": False})
        self.assertEqual(b["r"], 0.0)  # the errored scam message counts as a miss
        self.assertEqual(base["f1"], 1.0)

    def test_standin_dataset_has_both_classes_and_no_duplicates(self):
        from load_dataset import load
        rows = load()
        self.assertGreater(len(rows), 80)
        self.assertEqual(len({r["text"] for r in rows}), len(rows))
        self.assertTrue({"scam", "legit"} <= {r["label"] for r in rows})


class Stretch(unittest.TestCase):
    def test_zeroshot_parse(self):
        from zeroshot import parse
        self.assertTrue(parse("Scam"))
        self.assertFalse(parse(" legit."))
        self.assertTrue(parse("this is a scam"))
        self.assertIsNone(parse("not sure"))
        self.assertIsNone(parse(""))

    def test_zeroshot_against_fake_server(self):
        import http.server
        import threading
        from zeroshot import predict

        class H(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers["content-length"]); body = json.loads(self.rfile.read(n))
                assert "Message:" in body["messages"][0]["content"] and "tools" not in body  # one prompt, no tools
                out = json.dumps({"choices": [{"message": {"content": "scam"}}]}).encode()
                self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(out)
            def log_message(self, *a): pass
        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.assertTrue(predict("hi", base=f"http://127.0.0.1:{srv.server_port}/v1", key="k", model="m"))
        srv.shutdown()
        with self.assertRaises(RuntimeError):
            predict("hi", base="http://x", key="", model="")

    def test_summarize_counts_errors_wrong_and_builds_failure_table(self):
        from run_stretch import summarize
        rows = [{"id": "a", "kind": "text", "label": "scam", "text": "t1"}, {"id": "b", "kind": "text", "label": "legit", "text": "t2"}, {"id": "c", "kind": "text", "label": "scam", "text": "t3"}]
        v = lambda x: {"ok": True, "verdict": {"verdict": x, "score": 50, "evidence": ["e"]}}  # noqa: E731
        s = summarize(rows, {"a": v("likely_scam"), "b": v("likely_scam"), "c": {"ok": False, "error": "x"}}, {"a": True, "b": False, "c": None})
        self.assertEqual([f["id"] for f in s["failures"]], ["b", "c"])
        self.assertEqual(s["zero_shot_no_tools"]["f1"], 0.6667)  # TP=1, FN=1 (error counted wrong), FP=0
