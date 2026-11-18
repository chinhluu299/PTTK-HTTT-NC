"""Thông báo realtime bằng Server-Sent Events (F3, màn hình chờ quầy thuốc).

Kênh: staff:<id>, dept:<id>, role:<ROLE>, patient:<id>, display.
publish() an toàn khi gọi từ endpoint đồng bộ (chạy trong threadpool).
"""
import asyncio
from collections import defaultdict


class Broker:
    def __init__(self):
        self.loop: asyncio.AbstractEventLoop | None = None
        self.subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, channels: list[str]) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        for c in channels:
            self.subs[c].add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        for subs in self.subs.values():
            subs.discard(q)

    def publish(self, channel: str, event_type: str, data: dict | None = None):
        if not self.loop:
            return
        event = {"type": event_type, **(data or {})}
        for q in list(self.subs.get(channel, ())):
            self.loop.call_soon_threadsafe(self._put, q, event)

    @staticmethod
    def _put(q: asyncio.Queue, event: dict):
        if not q.full():
            q.put_nowait(event)


broker = Broker()
