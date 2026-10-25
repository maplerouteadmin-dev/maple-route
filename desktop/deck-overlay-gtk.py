#!/usr/bin/env python3
"""Maple Route's pop-up over the game in Steam Deck Gaming Mode.

gamescope draws "external overlay" windows (like the performance overlay) over the game, but always
full-screen from the top-left, so this is a see-through full-screen window that only paints the map
box in the chosen corner. Clicks pass through to the game. It draws pictures it is sent on stdin, one
JSON line each: {"x":4,"y":548,"png":"<base64>"} or {"hide":true}. It never looks at the game.
"""
import base64, json, subprocess, sys
import gi
gi.require_version('Gtk', '3.0'); gi.require_version('Gdk', '3.0'); gi.require_version('GdkPixbuf', '2.0'); gi.require_version('GdkX11', '3.0')
from gi.repository import Gtk, Gdk, GdkPixbuf, GLib, GdkX11  # noqa: F401  (GdkX11 gives the window id)
import cairo

state = {'pixbuf': None, 'x': 4, 'y': 548}

win = Gtk.Window(type=Gtk.WindowType.POPUP)
screen = win.get_screen()
win.set_visual(screen.get_rgba_visual())
win.set_app_paintable(True)
win.set_decorated(False)
win.set_accept_focus(False)
win.move(0, 0)
win.resize(screen.get_width() or 1280, screen.get_height() or 800)

def draw(_widget, cr):
    cr.set_operator(cairo.OPERATOR_SOURCE)
    cr.set_source_rgba(0, 0, 0, 0)
    cr.paint()
    if state['pixbuf'] is not None:
        cr.set_operator(cairo.OPERATOR_OVER)
        Gdk.cairo_set_source_pixbuf(cr, state['pixbuf'], state['x'], state['y'])
        cr.paint()
    return True
win.connect('draw', draw)

def realized(_widget):
    # Clicks go through to the game: an empty input shape.
    win.input_shape_combine_region(cairo.Region())
    xid = win.get_window().get_xid()
    subprocess.run(['xprop', '-id', str(xid), '-f', 'GAMESCOPE_EXTERNAL_OVERLAY', '32c', '-set', 'GAMESCOPE_EXTERNAL_OVERLAY', '1'], check=False, timeout=3)
win.connect('realize', realized)

def on_line(source, _condition):
    line = source.readline()
    if not line:
        Gtk.main_quit(); return False
    try:
        msg = json.loads(line)
        if msg.get('hide'):
            state['pixbuf'] = None
        else:
            state['x'], state['y'] = int(msg.get('x', 4)), int(msg.get('y', 548))
            if msg.get('png'):
                loader = GdkPixbuf.PixbufLoader.new_with_type('png')
                loader.write(base64.b64decode(msg['png'])); loader.close()
                state['pixbuf'] = loader.get_pixbuf()
        win.queue_draw()
    except Exception as error:  # a bad message never takes the pop-up down
        print('overlay message ignored:', error, file=sys.stderr)
    return True

GLib.io_add_watch(GLib.IOChannel.unix_new(sys.stdin.fileno()), GLib.IO_IN | GLib.IO_HUP, lambda ch, cond: on_line(sys.stdin, cond))
win.show_all()
Gtk.main()
