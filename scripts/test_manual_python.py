#!/usr/bin/env python3
"""Execute isolated manual-guide examples with in-memory framework doubles.

No server, HTTP request, signer, facilitator or payment is invoked. These checks
cover documented response/envelope behavior, not framework or chain integration.
"""
import ast
import base64
import json
import os
import pathlib
import re
import types
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent.parent


def blocks(path):
    return re.findall(r"```python\n(.*?)\n```", (ROOT / path).read_text(), re.S)


SERVER = blocks("x402/servers/python/manual-flow.mdx")
CLIENT_TEXT = (ROOT / "x402/clients/python/manual-flow.mdx").read_text()
CLIENT = blocks("x402/clients/python/manual-flow.mdx")
ENV = {"EVM_ADDRESS": "0x" + "1" * 40, "SVM_ADDRESS": "1" * 32, "SVM_FEE_PAYER": "2" * 32}
APPROVED = {"scheme": "exact", "network": "eip155:84532", "asset": "0x" + "3" * 40, "payTo": ENV["EVM_ADDRESS"], "amount": "10000", "maxTimeoutSeconds": 60, "extra": {"name": "USDC", "version": "2"}}
REQUIRED = {"x402Version": 2, "resource": {"url": "https://example.invalid/weather"}, "accepts": [APPROVED], "extensions": {"fixture": {"info": {"example": True}}}}


class App:
    def __init__(self, *args):
        pass

    def route(self, *args):
        return lambda handler: handler

    get = route


class ManualExamplesTest(unittest.TestCase):
    def configuration(self):
        namespace = {}
        with patch.dict(os.environ, ENV, clear=True):
            exec(SERVER[0], namespace)
        return namespace

    def test_coverage_and_python_syntax(self):
        self.assertEqual(len(SERVER), 4)
        self.assertEqual(len(CLIENT), 7)
        for code in SERVER + CLIENT:
            ast.parse(code)
        self.assertIn("not a complete", CLIENT_TEXT)

    def test_explicit_configuration_and_testnet_pairs(self):
        for name in ENV:
            for value in (None, "", "invalid"):
                env = {**ENV}
                if value is None:
                    del env[name]
                else:
                    env[name] = value
                with self.subTest(name=name, value=value), patch.dict(os.environ, env, clear=True):
                    with self.assertRaisesRegex(ValueError, name):
                        exec(SERVER[0], {})
        ns = self.configuration()
        required = ns["payment_required"]
        self.assertEqual([(a["network"], a["asset"]) for a in required["accepts"]], [
            ("eip155:84532", "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
            ("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
        ])
        self.assertEqual(required["accepts"][0]["payTo"], ENV["EVM_ADDRESS"])
        self.assertEqual(required["accepts"][1]["extra"]["feePayer"], ENV["SVM_FEE_PAYER"])
        self.assertEqual(json.loads(base64.b64decode(ns["payment_required_b64"])), required)

    def test_wsgi_returns_bytes_body(self):
        ns = self.configuration()
        exec(SERVER[1], ns)
        calls = []
        result = ns["send_402"](lambda status, headers: calls.append((status, dict(headers))), ns["payment_required_b64"])
        self.assertEqual(calls[0][0], "402 Payment Required")
        self.assertEqual(calls[0][1]["PAYMENT-REQUIRED"], ns["payment_required_b64"])
        self.assertEqual(result, [b'{"error":"Payment required"}'])

    def test_demo_framework_handlers_never_deliver_resource(self):
        for supplied in (None, "", "fixture-only-not-a-payment"):
            headers = {} if supplied is None else {"PAYMENT-SIGNATURE": supplied, "payment-signature": supplied}
            request = types.SimpleNamespace(headers=headers)
            flask = types.SimpleNamespace(Flask=App, request=request, jsonify=lambda body: body)
            fastapi = types.SimpleNamespace(FastAPI=App, Request=object, Response=lambda **kwargs: kwargs)
            with patch.dict("sys.modules", {"flask": flask, "fastapi": fastapi}):
                for index in (2, 3):
                    with self.subTest(supplied=supplied, framework=index):
                        ns = self.configuration()
                        exec(SERVER[index], ns)
                        result = ns["weather"]() if index == 2 else ns["weather"](request)
                        if index == 2:
                            body, status = result[:2]
                            response_headers = result[2] if len(result) > 2 else {}
                        else:
                            body, status = json.loads(result["content"]), result["status_code"]
                            response_headers = result.get("headers", {})
                        self.assertEqual(status, 402 if supplied is None else 501)
                        self.assertIn("error", body)
                        self.assertNotIn("weather", body)
                        self.assertEqual("PAYMENT-REQUIRED" in response_headers, status == 402)

    def test_decode_stops_on_non402_and_rejects_invalid_input(self):
        for status in (200, 204, 302, 400, 500):
            with self.assertRaisesRegex(RuntimeError, "Not a payment challenge"):
                exec(CLIENT[1], {"response": types.SimpleNamespace(status_code=status)})
        for header in (None, "!invalid!", base64.b64encode(b"{").decode()):
            with self.assertRaises(ValueError):
                exec(CLIENT[1], {"response": types.SimpleNamespace(status_code=402, headers={"PAYMENT-REQUIRED": header})})

    def test_selection_respects_prevalidated_policy(self):
        for change in ({"scheme": "upto"}, {"network": "eip155:8453"}, {"asset": "other"}, {"payTo": "other"}, {"amount": "10001"}, {"amount": "0"}, {"amount": "-1"}, {"amount": "1.5"}, {}):
            ns = {"payment_required": {**REQUIRED, "accepts": [{**APPROVED, **change}]}, "approved_network": APPROVED["network"], "approved_asset": APPROVED["asset"], "approved_recipient": APPROVED["payTo"], "max_amount_atomic": 10000}
            if change:
                with self.assertRaisesRegex(ValueError, "No payment option approved"):
                    exec(CLIENT[2], ns)
            else:
                exec(CLIENT[2], ns)
                self.assertEqual(ns["accepted"], APPROVED)

    def test_v2_envelope_shapes_and_encoding(self):
        for index in (3, 4):
            selected = APPROVED if index == 3 else {**APPROVED, "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"}
            ns = {"accepted": selected, "payment_required": REQUIRED, "payer_address": ENV["EVM_ADDRESS"], "transaction_bytes": b"fixture-only-not-a-transaction", "base64": base64, "json": json}
            exec(CLIENT[index], ns)
            payload = ns["payload"]
            self.assertEqual(set(payload), {"x402Version", "resource", "accepted", "payload", "extensions"})
            self.assertEqual(payload["accepted"], selected)
            self.assertEqual(payload["resource"], REQUIRED["resource"])
            self.assertEqual(payload["extensions"], REQUIRED["extensions"])
            self.assertEqual(json.loads(base64.b64decode(ns["payment_signature_b64"])), payload)
            if index == 3:
                self.assertRegex(payload["payload"]["authorization"]["nonce"], r"^0x[0-9a-f]{64}$")

    def test_settlement_json(self):
        examples = [json.loads(b) for b in re.findall(r"```json\n(.*?)\n```", CLIENT_TEXT, re.S)]
        self.assertEqual(len(examples), 3)
        self.assertEqual(examples[1]["network"], "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1")
        for example in examples:
            self.assertIsInstance(example["success"], bool)
            self.assertIsInstance(example["transaction"], str)
            self.assertIsInstance(example["network"], str)
            self.assertNotIn("accepts", example)
        self.assertEqual(examples[2], {"success": False, "errorReason": "insufficient_funds", "transaction": "", "network": "eip155:84532"})
        self.assertRegex(examples[0]["transaction"], r"^0x[0-9a-f]{64}$")

    def test_response_inspection_retains_errors_and_missingness(self):
        def execute(status, settlement):
            messages = []
            headers = {} if settlement is None else {"PAYMENT-RESPONSE": base64.b64encode(json.dumps(settlement).encode()).decode()}
            ns = {"base64": base64, "json": json, "print": lambda *args: messages.append(args), "retry_response": types.SimpleNamespace(status_code=status, headers=headers, json=lambda: {"resource": "fixture"})}
            error = None
            try:
                exec(CLIENT[6], ns)
            except RuntimeError as e:
                error = str(e)
            return messages, error

        for status in (200, 402, 503):
            settlement = {"success": False, "errorReason": "settlement_pending", "transaction": "fixture", "network": APPROVED["network"]}
            messages, error = execute(status, settlement)
            self.assertIn("Settlement not confirmed", error)
            self.assertEqual(messages[0][1], settlement)
            self.assertEqual(len(messages), 1)
        messages, error = execute(200, None)
        self.assertIsNone(error)
        self.assertIn("unavailable", messages[0][0])
        self.assertIn("reconcile", execute(503, None)[1])
        self.assertIsNone(execute(200, {"success": True, "transaction": "fixture", "network": APPROVED["network"]})[1])


if __name__ == "__main__":
    unittest.main()
