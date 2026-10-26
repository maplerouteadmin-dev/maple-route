"""Read the user-consented gamescope screen into the existing Maple Route reader.

The parent process chooses the current gamescope PipeWire node before starting us.
No game process, input device, or game network connection is opened here. Frames
are sent to the parent as length-prefixed BGRx bytes, never written to disk.
"""
import struct
import sys
import time
import signal

import gi

gi.require_version("Gst", "1.0")
from gi.repository import Gst


def main():
    node = int(sys.argv[1])
    Gst.init(None)
    # No fixed framerate in caps: gamescope's PipeWire node rejects that.
    pipeline = Gst.parse_launch(
        f"pipewiresrc path={node} always-copy=true ! "
        "video/x-raw,format=BGRx ! "
        "appsink name=frames sync=false max-buffers=1 drop=true"
    )
    sink = pipeline.get_by_name("frames")
    bus = pipeline.get_bus()
    if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
        print("Could not start the gamescope stream", file=sys.stderr)
        return 2
    last_sent = 0.0
    stopping = False

    def request_stop(_signum, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    try:
        while not stopping:
            msg = bus.timed_pop_filtered(0, Gst.MessageType.ERROR | Gst.MessageType.EOS)
            if msg:
                if msg.type == Gst.MessageType.ERROR:
                    error, _debug = msg.parse_error()
                    print(f"Capture stopped: {error.message}", file=sys.stderr)
                return 3
            sample = sink.emit("try-pull-sample", 250 * Gst.MSECOND)
            if sample is None or stopping:
                continue
            now = time.monotonic()
            if now - last_sent < 1 / 3:
                continue
            caps = sample.get_caps().get_structure(0)
            width = caps.get_value("width")
            height = caps.get_value("height")
            if not (0 < width <= 4096 and 0 < height <= 4096):
                continue
            size = width * height * 4
            frame = sample.get_buffer().extract_dup(0, size)
            if len(frame) != size:
                continue
            sys.stdout.buffer.write(struct.pack("<III", size, width, height))
            sys.stdout.buffer.write(frame)
            sys.stdout.buffer.flush()
            last_sent = now
    except BrokenPipeError:
        return 0
    finally:
        pipeline.set_state(Gst.State.NULL)


if __name__ == "__main__":
    sys.exit(main())
