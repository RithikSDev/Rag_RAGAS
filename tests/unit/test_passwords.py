from app.security.passwords import hash_password, verify_password


def test_hash_and_verify_round_trip():
    password_hash = hash_password("correct horse battery staple")

    assert verify_password("correct horse battery staple", password_hash)


def test_verify_rejects_wrong_password():
    password_hash = hash_password("correct horse battery staple")

    assert not verify_password("wrong password", password_hash)


def test_hash_never_stores_the_plaintext():
    password_hash = hash_password("correct horse battery staple")

    assert "correct horse battery staple" not in password_hash


def test_hash_is_salted_so_repeats_differ():
    first = hash_password("same password")
    second = hash_password("same password")

    assert first != second
    assert verify_password("same password", first)
    assert verify_password("same password", second)


def test_verify_fails_closed_on_a_malformed_hash():
    assert not verify_password("anything", "not-a-real-bcrypt-hash")
