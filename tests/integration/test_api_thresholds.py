def test_get_thresholds_returns_seeded_defaults(client, viewer_headers):
    response = client.get("/settings/thresholds", headers=viewer_headers)

    assert response.status_code == 200
    thresholds = response.json()["thresholds"]
    assert thresholds["faithfulness"] == {"good": 0.8, "warning": 0.5}
    assert set(thresholds) == {
        "faithfulness",
        "answer_relevancy",
        "context_precision",
        "context_recall",
    }


def test_update_thresholds_requires_admin(client, viewer_headers):
    response = client.post(
        "/settings/thresholds",
        json={"thresholds": {"faithfulness": {"good": 0.9, "warning": 0.6}}},
        headers=viewer_headers,
    )
    assert response.status_code == 403


def test_update_thresholds_persists_and_is_reflected_on_read(client, admin_headers):
    response = client.post(
        "/settings/thresholds",
        json={"thresholds": {"faithfulness": {"good": 0.95, "warning": 0.7}}},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["thresholds"]["faithfulness"] == {"good": 0.95, "warning": 0.7}

    read_back = client.get("/settings/thresholds", headers=admin_headers)
    assert read_back.json()["thresholds"]["faithfulness"] == {"good": 0.95, "warning": 0.7}
    # untouched metrics keep their defaults
    assert read_back.json()["thresholds"]["context_recall"] == {"good": 0.8, "warning": 0.5}


def test_update_thresholds_rejects_good_not_above_warning(client, admin_headers):
    response = client.post(
        "/settings/thresholds",
        json={"thresholds": {"faithfulness": {"good": 0.5, "warning": 0.5}}},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_update_thresholds_rejects_unknown_metric(client, admin_headers):
    response = client.post(
        "/settings/thresholds",
        json={"thresholds": {"bogus_metric": {"good": 0.9, "warning": 0.5}}},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_update_thresholds_can_update_multiple_metrics_at_once(client, admin_headers):
    response = client.post(
        "/settings/thresholds",
        json={
            "thresholds": {
                "faithfulness": {"good": 0.9, "warning": 0.6},
                "context_recall": {"good": 0.85, "warning": 0.55},
            }
        },
        headers=admin_headers,
    )

    body = response.json()["thresholds"]
    assert body["faithfulness"] == {"good": 0.9, "warning": 0.6}
    assert body["context_recall"] == {"good": 0.85, "warning": 0.55}
    assert body["answer_relevancy"] == {"good": 0.8, "warning": 0.5}  # unaffected
