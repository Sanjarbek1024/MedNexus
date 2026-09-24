from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["device"] in {"cpu", "cuda"}
    assert body["llm"]["provider"] == "groq"


def test_capabilities_list_the_full_taxonomy(client: TestClient) -> None:
    body = client.get("/api/capabilities").json()
    assert [m["id"] for m in body["modalities"]] == ["xray", "ct", "mri"]
    ct = body["modalities"][1]
    assert not ct["supported"]
    assert [v["id"] for v in ct["regions"][0]["views"]] == ["Axial", "Coronal", "Sagittal"]
