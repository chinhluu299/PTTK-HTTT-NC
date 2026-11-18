"""Sinh chuỗi VietQR (chuẩn EMVCo / NAPAS 247) để app ngân hàng quét chuyển khoản."""


def _tlv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def _crc16(data: str) -> str:
    crc = 0xFFFF
    for b in data.encode("utf-8"):
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def build_payload(bank_bin: str, account: str, amount: int, content: str) -> str:
    beneficiary = _tlv("00", bank_bin) + _tlv("01", account)
    merchant = _tlv("00", "A000000727") + _tlv("01", beneficiary) + _tlv("02", "QRIBFTTA")
    body = (
        _tlv("00", "01")
        + _tlv("01", "12")
        + _tlv("38", merchant)
        + _tlv("53", "704")
        + _tlv("54", str(int(amount)))
        + _tlv("58", "VN")
        + _tlv("62", _tlv("08", content))
        + "6304"
    )
    return body + _crc16(body)
