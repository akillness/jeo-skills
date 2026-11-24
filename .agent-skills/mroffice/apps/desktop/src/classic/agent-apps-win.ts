/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Windows' side of the AI's app actions (agent-apps.ts): one PowerShell
 * script a step, written to a file (a step's text can be long) and run with
 * the system's own Windows PowerShell 5.1. The work is C# compiled by
 * Add-Type (C# 5: what the .NET Framework's compiler takes), using UI
 * Automation to read an app's window and act on its elements by their
 * runtime ids, PrintWindow for that window's own picture, and window
 * messages to the app's own windows for keys, text and clicks, so nothing
 * goes to whatever window is in front. Only what UI Automation and messages
 * cannot do brings the app forward for that moment, and the app that was in
 * front is put back.
 *
 * Checked on Windows itself by scripts/check-win-computer.mjs (CI).
 */

const CSHARP = String.raw`
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

public static class MraiApps {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public int cbSize; public int flags; public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret; public RECT rcCaret;
  }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread, ref GUITHREADINFO info);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr h, POINT p, uint flags);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder name, int size);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);

  const uint WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_CHAR = 0x0102, WM_MOUSEMOVE = 0x0200;
  const uint WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202, WM_LBUTTONDBLCLK = 0x0203;
  const uint WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205, WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
  const uint WM_MOUSEWHEEL = 0x020A, WM_MOUSEHWHEEL = 0x020E, WM_CONTEXTMENU = 0x007B, WM_PASTE = 0x0302;
  const uint EM_REPLACESEL = 0x00C2;

  // ------------------------------------------------------------ JSON out

  public static string Json(object value) {
    StringBuilder text = new StringBuilder();
    Write(text, value);
    return text.ToString();
  }

  static void Write(StringBuilder text, object value) {
    if (value == null) { text.Append("null"); return; }
    if (value is string) { Quote(text, (string)value); return; }
    if (value is bool) { text.Append(((bool)value) ? "true" : "false"); return; }
    if (value is int || value is long || value is uint) { text.Append(Convert.ToInt64(value).ToString(CultureInfo.InvariantCulture)); return; }
    if (value is double || value is float) {
      double number = Convert.ToDouble(value);
      if (double.IsNaN(number) || double.IsInfinity(number)) { text.Append("null"); return; }
      text.Append(Math.Round(number, 2).ToString(CultureInfo.InvariantCulture)); return;
    }
    IDictionary map = value as IDictionary;
    if (map != null) {
      text.Append('{');
      bool first = true;
      foreach (DictionaryEntry entry in map) {
        if (!first) text.Append(',');
        first = false;
        Quote(text, Convert.ToString(entry.Key, CultureInfo.InvariantCulture));
        text.Append(':');
        Write(text, entry.Value);
      }
      text.Append('}');
      return;
    }
    IEnumerable list = value as IEnumerable;
    if (list != null) {
      text.Append('[');
      bool first = true;
      foreach (object item in list) {
        if (!first) text.Append(',');
        first = false;
        Write(text, item);
      }
      text.Append(']');
      return;
    }
    Quote(text, Convert.ToString(value, CultureInfo.InvariantCulture));
  }

  static void Quote(StringBuilder text, string value) {
    text.Append('"');
    foreach (char c in value) {
      switch (c) {
        case '"': text.Append("\\\""); break;
        case '\\': text.Append("\\\\"); break;
        case '\n': text.Append("\\n"); break;
        case '\r': text.Append("\\r"); break;
        case '\t': text.Append("\\t"); break;
        default:
          if (c < 0x20) text.Append("\\u").Append(((int)c).ToString("x4"));
          else text.Append(c);
          break;
      }
    }
    text.Append('"');
  }

  public static Dictionary<string, object> Fail(string code, string message) {
    Dictionary<string, object> answer = new Dictionary<string, object>();
    answer["error"] = code;
    if (message != null) answer["message"] = message;
    return answer;
  }

  static string Clip(string text, int limit) {
    if (text == null) return "";
    text = text.Replace("\r", "");
    return text.Length <= limit ? text : text.Substring(0, limit) + "…";
  }

  // ------------------------------------------------------------ the lock screen

  public static string Locked() {
    Dictionary<string, object> answer = new Dictionary<string, object>();
    answer["locked"] = Process.GetProcessesByName("LogonUI").Length > 0;
    return Json(answer);
  }

  // ------------------------------------------------------------ apps

  static string Describe(Process process) {
    try {
      string description = process.MainModule.FileVersionInfo.FileDescription;
      if (!string.IsNullOrEmpty(description)) return description;
    } catch (Exception) { }
    return process.ProcessName;
  }

  static string PathOf(Process process) {
    try { return process.MainModule.FileName; } catch (Exception) { return ""; }
  }

  /// <summary>The Start menu's apps (name TAB AppID lines) and the running ones with a window.</summary>
  public static string Apps(string[] startApps) {
    List<object> apps = new List<object>();
    IntPtr front = GetForegroundWindow();
    Dictionary<string, Dictionary<string, object>> byExe = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
    foreach (Process process in Process.GetProcesses()) {
      if (process.MainWindowHandle == IntPtr.Zero) continue;
      string path = PathOf(process);
      Dictionary<string, object> app = new Dictionary<string, object>();
      string name = Describe(process);
      List<object> names = new List<object>();
      names.Add(process.ProcessName);
      if (!string.IsNullOrEmpty(process.MainWindowTitle)) names.Add(process.MainWindowTitle);
      if (process.ProcessName == "ApplicationFrameHost" && !string.IsNullOrEmpty(process.MainWindowTitle)) {
        // A Store app's window is its frame host's: named by its title.
        name = process.MainWindowTitle;
        app["window"] = process.MainWindowTitle;
      }
      app["name"] = name;
      app["names"] = names;
      app["id"] = path.Length > 0 ? path : process.ProcessName;
      app["path"] = path;
      app["running"] = true;
      app["pid"] = process.Id;
      app["hwnd"] = process.MainWindowHandle.ToInt64();
      if (process.MainWindowHandle == front) app["front"] = true;
      try { app["last_used"] = process.StartTime.ToUniversalTime().ToString("o"); } catch (Exception) { }
      apps.Add(app);
      if (path.Length > 0) byExe[System.IO.Path.GetFileName(path)] = app;
    }
    foreach (string row in startApps) {
      int tab = row.IndexOf('\t');
      if (tab <= 0) continue;
      string name = row.Substring(0, tab);
      string id = row.Substring(tab + 1);
      string exe = id.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? System.IO.Path.GetFileName(id) : "";
      Dictionary<string, object> running;
      if (exe.Length > 0 && byExe.TryGetValue(exe, out running)) {
        ((List<object>)running["names"]).Add(name);
        running["start_id"] = id;
        continue;
      }
      Dictionary<string, object> app = new Dictionary<string, object>();
      app["name"] = name;
      app["id"] = id;
      app["running"] = false;
      apps.Add(app);
    }
    Dictionary<string, object> answer = new Dictionary<string, object>();
    answer["apps"] = apps;
    return Json(answer);
  }

  // ------------------------------------------------------------ windows

  static int ProcessOf(AutomationElement element) {
    try { return element.Current.ProcessId; } catch (Exception) { return 0; }
  }

  static string ProcessName(int pid) {
    try { return Process.GetProcessById(pid).ProcessName; } catch (Exception) { return ""; }
  }

  /// <summary>An app's top-level windows: by its process, its program's name, or its windows' titles.</summary>
  public static List<AutomationElement> WindowsOf(int pid, string exe, string title) {
    List<AutomationElement> found = new List<AutomationElement>();
    AutomationElementCollection all = AutomationElement.RootElement.FindAll(TreeScope.Children, Condition.TrueCondition);
    string exeName = string.IsNullOrEmpty(exe) ? "" : System.IO.Path.GetFileNameWithoutExtension(exe);
    foreach (AutomationElement window in all) {
      int owner = ProcessOf(window);
      bool mine = pid > 0 && owner == pid;
      if (!mine && exeName.Length > 0) mine = string.Equals(ProcessName(owner), exeName, StringComparison.OrdinalIgnoreCase);
      if (!mine && !string.IsNullOrEmpty(title)) {
        string name = "";
        try { name = window.Current.Name ?? ""; } catch (Exception) { }
        mine = name.IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0;
      }
      if (mine) found.Add(window);
    }
    return found;
  }

  static long Handle(AutomationElement element) {
    try { return element.Current.NativeWindowHandle; } catch (Exception) { return 0; }
  }

  public static AutomationElement ChooseWindow(List<AutomationElement> windows, long hwnd, string wanted) {
    if (windows.Count == 0) return null;
    int index;
    if (!string.IsNullOrEmpty(wanted) && int.TryParse(wanted, out index) && index >= 0 && index < windows.Count) return windows[index];
    if (!string.IsNullOrEmpty(wanted)) {
      foreach (AutomationElement window in windows) {
        string name = "";
        try { name = window.Current.Name ?? ""; } catch (Exception) { }
        if (name.IndexOf(wanted, StringComparison.OrdinalIgnoreCase) >= 0) return window;
      }
    }
    if (hwnd != 0) foreach (AutomationElement window in windows) if (Handle(window) == hwnd) return window;
    IntPtr front = GetForegroundWindow();
    foreach (AutomationElement window in windows) if (Handle(window) == front.ToInt64()) return window;
    foreach (AutomationElement window in windows) if (!IsIconic(new IntPtr(Handle(window)))) return window;
    return windows[0];
  }

  /// <summary>The window of an app a step is about (null: none open).</summary>
  public static AutomationElement Window(int pid, string exe, string title, long hwnd, string wanted) {
    return ChooseWindow(WindowsOf(pid, exe, title), hwnd, wanted);
  }

  public static int CountWindows(int pid, string exe, string title) {
    return WindowsOf(pid, exe, title).Count;
  }

  // ------------------------------------------------------------ reading

  static readonly AutomationProperty[] Properties = new AutomationProperty[] {
    AutomationElement.NameProperty, AutomationElement.ControlTypeProperty, AutomationElement.BoundingRectangleProperty,
    AutomationElement.IsEnabledProperty, AutomationElement.HasKeyboardFocusProperty, AutomationElement.IsOffscreenProperty,
    AutomationElement.IsPasswordProperty, AutomationElement.RuntimeIdProperty, AutomationElement.NativeWindowHandleProperty,
    AutomationElement.HelpTextProperty,
    AutomationElement.IsInvokePatternAvailableProperty, AutomationElement.IsTogglePatternAvailableProperty,
    AutomationElement.IsExpandCollapsePatternAvailableProperty, AutomationElement.IsSelectionItemPatternAvailableProperty,
    AutomationElement.IsValuePatternAvailableProperty, AutomationElement.IsRangeValuePatternAvailableProperty,
    AutomationElement.IsScrollPatternAvailableProperty, AutomationElement.IsTextPatternAvailableProperty,
    ValuePattern.ValueProperty, ValuePattern.IsReadOnlyProperty, TogglePattern.ToggleStateProperty,
    ExpandCollapsePattern.ExpandCollapseStateProperty, SelectionItemPattern.IsSelectedProperty,
  };

  static object Cached(AutomationElement element, AutomationProperty property) {
    try {
      object value = element.GetCachedPropertyValue(property, true);
      return value == AutomationElement.NotSupported ? null : value;
    } catch (Exception) { return null; }
  }

  static bool Flag(AutomationElement element, AutomationProperty property) {
    object value = Cached(element, property);
    return value is bool && (bool)value;
  }

  public static string RuntimeId(int[] id) {
    if (id == null) return "";
    string[] parts = new string[id.Length];
    for (int i = 0; i < id.Length; i++) parts[i] = id[i].ToString(CultureInfo.InvariantCulture);
    return string.Join(".", parts);
  }

  static readonly string[] Quiet = new string[] { "Pane", "Group", "Custom" };
  static readonly string[] Skipped = new string[] { "ScrollBar", "Thumb", "Separator", "TitleBar" };

  static bool In(string[] set, string value) { return Array.IndexOf(set, value) >= 0; }

  class Walk {
    public List<object> Nodes = new List<object>();
    public int Limit;
    public bool Busy;
    public bool Truncated;
    public int Offscreen;
    public string Focused;
  }

  static void Visit(AutomationElement element, int depth, Walk walk) {
    if (walk.Nodes.Count >= walk.Limit) { walk.Truncated = true; return; }
    ControlType type = Cached(element, AutomationElement.ControlTypeProperty) as ControlType;
    string role = type == null ? "Unknown" : type.ProgrammaticName.Replace("ControlType.", "");
    if (In(Skipped, role)) return;
    if (depth > 0 && Flag(element, AutomationElement.IsOffscreenProperty)) { walk.Offscreen++; return; }
    string name = (Cached(element, AutomationElement.NameProperty) as string) ?? "";
    string value = "";
    if (Flag(element, AutomationElement.IsValuePatternAvailableProperty)) value = (Cached(element, ValuePattern.ValueProperty) as string) ?? "";
    if (value.Length == 0 && (role == "Document" || role == "Edit") && Flag(element, AutomationElement.IsTextPatternAvailableProperty)) {
      // A document's text (Notepad's, WordPad's) has no value: read through its text pattern.
      try {
        object text = element.GetCurrentPattern(TextPattern.Pattern);
        value = ((TextPattern)text).DocumentRange.GetText(1500) ?? "";
      } catch (Exception) { }
    }
    if (role == "ProgressBar") walk.Busy = true;
    List<AutomationElement> children = new List<AutomationElement>();
    try { foreach (AutomationElement child in element.CachedChildren) children.Add(child); } catch (Exception) { }
    bool quiet = depth > 0 && In(Quiet, role) && name.Length == 0 && value.Length == 0;
    bool empty = (role == "Text" || role == "Image") && name.Length == 0 && children.Count == 0;
    int childDepth = depth;
    if (!quiet && !empty) {
      string id = RuntimeId(Cached(element, AutomationElement.RuntimeIdProperty) as int[]);
      Dictionary<string, object> node = new Dictionary<string, object>();
      node["id"] = id;
      node["d"] = depth;
      node["role"] = role;
      if (name.Length > 0) node["label"] = Clip(name, 200);
      if (value.Length > 0) node["value"] = Clip(value, role == "Edit" || role == "Document" ? 1500 : 200);
      if (name.Length == 0) {
        string help = Cached(element, AutomationElement.HelpTextProperty) as string;
        if (!string.IsNullOrEmpty(help)) node["label"] = Clip(help, 200);
      }
      object box = Cached(element, AutomationElement.BoundingRectangleProperty);
      if (box is System.Windows.Rect) {
        System.Windows.Rect rect = (System.Windows.Rect)box;
        if (!rect.IsEmpty) { node["x"] = rect.X; node["y"] = rect.Y; node["w"] = rect.Width; node["h"] = rect.Height; }
      }
      List<object> flags = new List<object>();
      List<object> actions = new List<object>();
      object enabled = Cached(element, AutomationElement.IsEnabledProperty);
      if (enabled is bool && !(bool)enabled) flags.Add("disabled");
      if (Flag(element, AutomationElement.HasKeyboardFocusProperty)) { flags.Add("focused"); walk.Focused = id; }
      if (Flag(element, AutomationElement.IsPasswordProperty)) flags.Add("password");
      if (role == "ProgressBar") flags.Add("busy");
      if (Flag(element, AutomationElement.IsInvokePatternAvailableProperty)) actions.Add("press");
      if (Flag(element, AutomationElement.IsTogglePatternAvailableProperty)) {
        actions.Add("toggle");
        object state = Cached(element, TogglePattern.ToggleStateProperty);
        if (state is ToggleState && (ToggleState)state == ToggleState.On) flags.Add("checked");
      }
      if (Flag(element, AutomationElement.IsSelectionItemPatternAvailableProperty)) {
        actions.Add("select");
        if (Flag(element, SelectionItemPattern.IsSelectedProperty)) flags.Add("selected");
      }
      if (Flag(element, AutomationElement.IsExpandCollapsePatternAvailableProperty)) {
        object state = Cached(element, ExpandCollapsePattern.ExpandCollapseStateProperty);
        bool open = state is ExpandCollapseState && (ExpandCollapseState)state == ExpandCollapseState.Expanded;
        flags.Add(open ? "expanded" : "collapsed");
        actions.Add(open ? "collapse" : "expand");
      }
      if ((Flag(element, AutomationElement.IsValuePatternAvailableProperty) && !Flag(element, ValuePattern.IsReadOnlyProperty))
          || Flag(element, AutomationElement.IsRangeValuePatternAvailableProperty)) actions.Add("set_value");
      if (Flag(element, AutomationElement.IsTextPatternAvailableProperty)) actions.Add("select_text");
      if (Flag(element, AutomationElement.IsScrollPatternAvailableProperty)) actions.Add("scroll");
      if (flags.Count > 0) node["flags"] = flags;
      if (actions.Count > 0) node["actions"] = actions;
      walk.Nodes.Add(node);
      childDepth = depth + 1;
    }
    if (depth < 60) foreach (AutomationElement child in children) Visit(child, childDepth, walk);
  }

  static CacheRequest TreeCache() {
    CacheRequest request = new CacheRequest();
    foreach (AutomationProperty property in Properties) request.Add(property);
    request.TreeScope = TreeScope.Subtree;
    request.TreeFilter = Automation.ControlViewCondition;
    request.AutomationElementMode = AutomationElementMode.Full;
    return request;
  }

  public static Dictionary<string, object> WindowInfo(AutomationElement window, int index) {
    Dictionary<string, object> info = new Dictionary<string, object>();
    long hwnd = Handle(window);
    info["index"] = index;
    try { info["title"] = window.Current.Name ?? ""; } catch (Exception) { info["title"] = ""; }
    info["hwnd"] = hwnd;
    info["id"] = hwnd;
    RECT rect;
    if (hwnd != 0 && GetWindowRect(new IntPtr(hwnd), out rect)) {
      info["x"] = rect.Left; info["y"] = rect.Top; info["w"] = rect.Right - rect.Left; info["h"] = rect.Bottom - rect.Top;
    }
    if (hwnd != 0 && IsIconic(new IntPtr(hwnd))) info["minimized"] = true;
    info["scale"] = 1;
    return info;
  }

  public static string State(int pid, string exe, string title, long hwnd, string wanted, int limit, string appName, string appId) {
    List<AutomationElement> windows = WindowsOf(pid, exe, title);
    Dictionary<string, object> answer = new Dictionary<string, object>();
    Dictionary<string, object> app = new Dictionary<string, object>();
    app["name"] = appName;
    app["id"] = appId;
    List<object> rows = new List<object>();
    for (int i = 0; i < windows.Count; i++) {
      Dictionary<string, object> row = new Dictionary<string, object>();
      row["index"] = i;
      try { row["title"] = windows[i].Current.Name ?? ""; } catch (Exception) { row["title"] = ""; }
      if (IsIconic(new IntPtr(Handle(windows[i])))) row["minimized"] = true;
      rows.Add(row);
    }
    answer["windows"] = rows;
    AutomationElement window = ChooseWindow(windows, hwnd, wanted);
    if (window == null) {
      answer["app"] = app;
      answer["nodes"] = new List<object>();
      return Json(answer);
    }
    int windowPid = ProcessOf(window);
    app["pid"] = windowPid;
    if (Handle(window) == GetForegroundWindow().ToInt64()) app["front"] = true;
    answer["app"] = app;
    answer["window"] = WindowInfo(window, windows.IndexOf(window));
    Walk walk = new Walk();
    walk.Limit = limit;
    AutomationElement cached;
    try {
      cached = window.GetUpdatedCache(TreeCache());
    } catch (Exception error) {
      return Json(Fail("read_failed", error.Message));
    }
    Visit(cached, 0, walk);
    answer["nodes"] = walk.Nodes;
    if (walk.Busy) answer["busy"] = true;
    if (walk.Truncated) answer["truncated"] = true;
    if (walk.Offscreen > 0) answer["offscreen"] = walk.Offscreen;
    if (walk.Focused != null) answer["focused"] = walk.Focused;
    return Json(answer);
  }

  // ------------------------------------------------------------ the window's picture

  public static string Shot(long hwnd, string file, int width, int height) {
    IntPtr handle = new IntPtr(hwnd);
    RECT rect;
    if (hwnd == 0 || !GetWindowRect(handle, out rect)) return Json(Fail("no_window", null));
    int w = Math.Max(1, rect.Right - rect.Left), h = Math.Max(1, rect.Bottom - rect.Top);
    using (Bitmap full = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
      using (Graphics graphics = Graphics.FromImage(full)) {
        IntPtr hdc = graphics.GetHdc();
        // PW_RENDERFULLCONTENT: the window's own content, covered or not.
        bool drawn = PrintWindow(handle, hdc, 2);
        graphics.ReleaseHdc(hdc);
        if (!drawn) return Json(Fail("picture_failed", null));
      }
      using (Bitmap small = new Bitmap(Math.Max(1, width), Math.Max(1, height))) {
        using (Graphics graphics = Graphics.FromImage(small)) {
          graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
          graphics.DrawImage(full, 0, 0, small.Width, small.Height);
        }
        ImageCodecInfo jpeg = null;
        foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) if (codec.MimeType == "image/jpeg") jpeg = codec;
        EncoderParameters quality = new EncoderParameters(1);
        quality.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 70L);
        small.Save(file, jpeg, quality);
      }
    }
    Dictionary<string, object> answer = new Dictionary<string, object>();
    answer["ok"] = true;
    return Json(answer);
  }

  // ------------------------------------------------------------ acting

  public static AutomationElement Find(AutomationElement window, string runtimeId) {
    string[] parts = runtimeId.Split('.');
    int[] id = new int[parts.Length];
    for (int i = 0; i < parts.Length; i++) id[i] = int.Parse(parts[i], CultureInfo.InvariantCulture);
    PropertyCondition condition = new PropertyCondition(AutomationElement.RuntimeIdProperty, id);
    AutomationElement found = window.FindFirst(TreeScope.Subtree, condition);
    return found;
  }

  static object Pattern(AutomationElement element, AutomationPattern pattern) {
    object value;
    return element.TryGetCurrentPattern(pattern, out value) ? value : null;
  }

  static Dictionary<string, object> Target(AutomationElement element) {
    Dictionary<string, object> target = new Dictionary<string, object>();
    try {
      target["role"] = element.Current.ControlType.ProgrammaticName.Replace("ControlType.", "");
      target["label"] = Clip(element.Current.Name ?? "", 200);
    } catch (Exception) { }
    return target;
  }

  /// <summary>The window of the element to send messages to: its own, or the app's.</summary>
  static IntPtr NativeOf(AutomationElement element, IntPtr top) {
    AutomationElement current = element;
    TreeWalker walker = TreeWalker.RawViewWalker;
    while (current != null) {
      long handle = 0;
      try { handle = current.Current.NativeWindowHandle; } catch (Exception) { }
      if (handle != 0) return new IntPtr(handle);
      try { current = walker.GetParent(current); } catch (Exception) { break; }
    }
    return top;
  }

  static IntPtr FocusOf(IntPtr top) {
    uint pid;
    uint thread = GetWindowThreadProcessId(top, out pid);
    GUITHREADINFO info = new GUITHREADINFO();
    info.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (GetGUIThreadInfo(thread, ref info) && info.hwndFocus != IntPtr.Zero) return info.hwndFocus;
    return top;
  }

  static IntPtr LParam(int x, int y) {
    return new IntPtr((y << 16) | (x & 0xFFFF));
  }

  /// <summary>A click as the app's own window receives one, at a point of the screen; the pointer does not move.</summary>
  static void PostClick(IntPtr top, int x, int y, string button, int count) {
    POINT point = new POINT(); point.X = x; point.Y = y;
    POINT client = point;
    ScreenToClient(top, ref client);
    IntPtr child = ChildWindowFromPointEx(top, client, 0x0001 | 0x0004);
    IntPtr target = child == IntPtr.Zero ? top : child;
    POINT local = point;
    ScreenToClient(target, ref local);
    IntPtr at = LParam(local.X, local.Y);
    uint down = button == "right" ? WM_RBUTTONDOWN : button == "middle" ? WM_MBUTTONDOWN : WM_LBUTTONDOWN;
    uint up = button == "right" ? WM_RBUTTONUP : button == "middle" ? WM_MBUTTONUP : WM_LBUTTONUP;
    IntPtr held = new IntPtr(button == "right" ? 0x0002 : button == "middle" ? 0x0010 : 0x0001);
    PostMessage(target, WM_MOUSEMOVE, IntPtr.Zero, at);
    for (int i = 0; i < Math.Max(1, count); i++) {
      PostMessage(target, i == 1 && button == "left" ? WM_LBUTTONDBLCLK : down, held, at);
      PostMessage(target, up, IntPtr.Zero, at);
      Thread.Sleep(40);
    }
    if (button == "right") PostMessage(target, WM_CONTEXTMENU, target, LParam(x, y));
  }

  static void PostDrag(IntPtr top, int x, int y, int toX, int toY) {
    POINT client = new POINT(); client.X = x; client.Y = y;
    ScreenToClient(top, ref client);
    IntPtr child = ChildWindowFromPointEx(top, client, 0x0001 | 0x0004);
    IntPtr target = child == IntPtr.Zero ? top : child;
    for (int step = 0; step <= 20; step++) {
      POINT local = new POINT();
      local.X = x + (toX - x) * step / 20;
      local.Y = y + (toY - y) * step / 20;
      ScreenToClient(target, ref local);
      IntPtr at = LParam(local.X, local.Y);
      if (step == 0) PostMessage(target, WM_LBUTTONDOWN, new IntPtr(1), at);
      else PostMessage(target, WM_MOUSEMOVE, new IntPtr(1), at);
      if (step == 20) PostMessage(target, WM_LBUTTONUP, IntPtr.Zero, at);
      Thread.Sleep(12);
    }
  }

  static bool IsEdit(IntPtr handle) {
    StringBuilder name = new StringBuilder(256);
    GetClassName(handle, name, name.Capacity);
    string kind = name.ToString();
    return kind == "Edit" || kind.StartsWith("RichEdit", StringComparison.OrdinalIgnoreCase) || kind.StartsWith("RICHEDIT", StringComparison.Ordinal);
  }

  /// <summary>Key names as the AI says them, to virtual keys.</summary>
  public static int VirtualKey(string name) {
    switch (name) {
      case "return": case "enter": return 0x0D;
      case "tab": return 0x09;
      case "escape": case "esc": return 0x1B;
      case "backspace": return 0x08;
      case "delete": case "forwarddelete": return 0x2E;
      case "space": return 0x20;
      case "left": return 0x25; case "up": return 0x26; case "right": return 0x27; case "down": return 0x28;
      case "home": return 0x24; case "end": return 0x23; case "pageup": return 0x21; case "pagedown": return 0x22;
      case "insert": return 0x2D;
    }
    if (name.Length >= 2 && name[0] == 'f') {
      int number;
      if (int.TryParse(name.Substring(1), out number) && number >= 1 && number <= 24) return 0x70 + number - 1;
    }
    if (name.Length == 1) {
      char c = char.ToUpperInvariant(name[0]);
      if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return c;
      switch (c) {
        case ';': return 0xBA; case '=': return 0xBB; case ',': return 0xBC; case '-': return 0xBD; case '.': return 0xBE;
        case '/': return 0xBF; case '\x60': return 0xC0; case '[': return 0xDB; case '\\': return 0xDC; case ']': return 0xDD; case '\'': return 0xDE;
      }
    }
    return 0;
  }

  static IntPtr KeyParam(int vk, bool up) {
    uint scan = MapVirtualKey((uint)vk, 0);
    long value = 1 | ((long)scan << 16);
    if (vk >= 0x21 && vk <= 0x2E) value |= 1L << 24;
    if (up) value |= (1L << 30) | (1L << 31);
    return new IntPtr(unchecked((int)value));
  }

  static void PostKey(IntPtr window, int vk) {
    PostMessage(window, WM_KEYDOWN, new IntPtr(vk), KeyParam(vk, false));
    if (vk == 0x0D) PostMessage(window, WM_CHAR, new IntPtr(13), KeyParam(vk, false));
    else if (vk == 0x09) PostMessage(window, WM_CHAR, new IntPtr(9), KeyParam(vk, false));
    else if (vk == 0x08) PostMessage(window, WM_CHAR, new IntPtr(8), KeyParam(vk, false));
    else if (vk == 0x1B) PostMessage(window, WM_CHAR, new IntPtr(27), KeyParam(vk, false));
    PostMessage(window, WM_KEYUP, new IntPtr(vk), KeyParam(vk, true));
    Thread.Sleep(15);
  }

  static void PostText(IntPtr window, string text) {
    foreach (char c in text) {
      PostMessage(window, WM_CHAR, new IntPtr(c == '\n' ? 13 : c), new IntPtr(1));
      Thread.Sleep(3);
    }
  }

  /// <summary>Runs a step with the app in front, then puts the person's window back.</summary>
  public static bool InFront(IntPtr top, Action step) {
    IntPtr before = GetForegroundWindow();
    if (before == top) { step(); return false; }
    if (IsIconic(top)) ShowWindow(top, 9);
    // The ALT tap is what lets a background process move the foreground (as SetForegroundWindow's rules allow).
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(top);
    Thread.Sleep(150);
    step();
    Thread.Sleep(250);
    if (before != IntPtr.Zero) {
      keybd_event(0x12, 0, 0, UIntPtr.Zero);
      keybd_event(0x12, 0, 2, UIntPtr.Zero);
      SetForegroundWindow(before);
    }
    return true;
  }

  public static string Act(AutomationElement window, string elementId, string op, string text, string value, string key, string button,
                           int count, int repeat, double x, double y, double toX, double toY, int dx, int dy, string actionName,
                           int start, int length, bool hasPoint) {
    IntPtr top = new IntPtr(Handle(window));
    AutomationElement element = null;
    Dictionary<string, object> done = new Dictionary<string, object>();
    done["ok"] = true;
    if (!string.IsNullOrEmpty(elementId)) {
      element = Find(window, elementId);
      if (element == null) return Json(Fail("element_gone", "That element is no longer in the window: read the app's state again."));
      done["target"] = Target(element);
    }
    try {
      switch (op) {
        case "describe":
          return Json(done);
        case "click": {
          if (element != null && button == "left" && count <= 1) {
            object invoke = Pattern(element, InvokePattern.Pattern);
            if (invoke != null) { ((InvokePattern)invoke).Invoke(); done["method"] = "invoke"; return Json(done); }
            object toggle = Pattern(element, TogglePattern.Pattern);
            if (toggle != null) { ((TogglePattern)toggle).Toggle(); done["method"] = "toggle"; return Json(done); }
            object select = Pattern(element, SelectionItemPattern.Pattern);
            if (select != null) { ((SelectionItemPattern)select).Select(); done["method"] = "select"; return Json(done); }
            object expand = Pattern(element, ExpandCollapsePattern.Pattern);
            if (expand != null) {
              ExpandCollapsePattern pattern = (ExpandCollapsePattern)expand;
              if (pattern.Current.ExpandCollapseState == ExpandCollapseState.Expanded) pattern.Collapse(); else pattern.Expand();
              done["method"] = "expand_collapse"; return Json(done);
            }
          }
          int px, py;
          if (element != null) {
            System.Windows.Rect rect = element.Current.BoundingRectangle;
            if (rect.IsEmpty) return Json(Fail("element_has_no_frame", null));
            px = (int)(rect.X + rect.Width / 2); py = (int)(rect.Y + rect.Height / 2);
          } else if (hasPoint) {
            px = (int)x; py = (int)y;
          } else {
            return Json(Fail("name_an_element_or_point", null));
          }
          PostClick(top, px, py, button, count);
          done["method"] = "click_message";
          return Json(done);
        }
        case "drag":
          PostDrag(top, (int)x, (int)y, (int)toX, (int)toY);
          done["method"] = "drag_message";
          return Json(done);
        case "set_value": {
          if (element == null) return Json(Fail("name_an_element", null));
          object valuePattern = Pattern(element, ValuePattern.Pattern);
          if (valuePattern != null && !((ValuePattern)valuePattern).Current.IsReadOnly) {
            ((ValuePattern)valuePattern).SetValue(value ?? "");
            done["method"] = "set_value"; return Json(done);
          }
          object range = Pattern(element, RangeValuePattern.Pattern);
          double number;
          if (range != null && double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out number)) {
            ((RangeValuePattern)range).SetValue(number);
            done["method"] = "set_range_value"; return Json(done);
          }
          object toggle = Pattern(element, TogglePattern.Pattern);
          if (toggle != null) {
            bool want = value == "1" || string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) || string.Equals(value, "on", StringComparison.OrdinalIgnoreCase);
            TogglePattern pattern = (TogglePattern)toggle;
            for (int i = 0; i < 3 && (pattern.Current.ToggleState == ToggleState.On) != want; i++) pattern.Toggle();
            done["method"] = "toggle"; return Json(done);
          }
          return Json(Fail("value_not_settable", "This element's value cannot be set; click it and type instead."));
        }
        case "select_text": {
          if (element == null) return Json(Fail("name_an_element", null));
          object textPattern = Pattern(element, TextPattern.Pattern);
          if (textPattern == null) return Json(Fail("select_failed", "This element has no text to select."));
          TextPatternRange all = ((TextPattern)textPattern).DocumentRange;
          TextPatternRange found = string.IsNullOrEmpty(text) ? all : all.FindText(text, false, false);
          if (found == null) return Json(Fail("text_not_found", "That text is not in the element."));
          found.Select();
          done["method"] = "select_range"; return Json(done);
        }
        case "action": {
          if (element == null) return Json(Fail("name_an_element", null));
          object pattern = null;
          switch (actionName) {
            case "press": case "invoke": pattern = Pattern(element, InvokePattern.Pattern); if (pattern != null) ((InvokePattern)pattern).Invoke(); break;
            case "toggle": pattern = Pattern(element, TogglePattern.Pattern); if (pattern != null) ((TogglePattern)pattern).Toggle(); break;
            case "select": pattern = Pattern(element, SelectionItemPattern.Pattern); if (pattern != null) ((SelectionItemPattern)pattern).Select(); break;
            case "expand": pattern = Pattern(element, ExpandCollapsePattern.Pattern); if (pattern != null) ((ExpandCollapsePattern)pattern).Expand(); break;
            case "collapse": pattern = Pattern(element, ExpandCollapsePattern.Pattern); if (pattern != null) ((ExpandCollapsePattern)pattern).Collapse(); break;
            case "scroll_into_view": pattern = Pattern(element, ScrollItemPattern.Pattern); if (pattern != null) ((ScrollItemPattern)pattern).ScrollIntoView(); break;
            case "focus": element.SetFocus(); pattern = element; break;
            case "show_menu": {
              System.Windows.Rect rect = element.Current.BoundingRectangle;
              PostClick(top, (int)(rect.X + rect.Width / 2), (int)(rect.Y + rect.Height / 2), "right", 1);
              pattern = element;
              break;
            }
          }
          if (pattern == null) return Json(Fail("action_not_offered", "The element does not offer " + actionName + "."));
          done["method"] = actionName; return Json(done);
        }
        case "key": {
          string[] parts = (key ?? "").ToLowerInvariant().Split('+');
          bool control = false, shift = false, alt = false, win = false;
          string name = "";
          foreach (string part in parts) {
            if (part == "ctrl" || part == "control" || part == "cmd" || part == "command") control = true;
            else if (part == "shift") shift = true;
            else if (part == "alt" || part == "option") alt = true;
            else if (part == "win" || part == "meta" || part == "super") win = true;
            else name = part;
          }
          int vk = VirtualKey(name);
          if (vk == 0) return Json(Fail("unknown_key", null));
          if (element != null) { try { element.SetFocus(); } catch (Exception) { } }
          int times = Math.Max(1, Math.Min(50, repeat));
          if (!control && !shift && !alt && !win) {
            IntPtr focus = element != null ? NativeOf(element, FocusOf(top)) : FocusOf(top);
            for (int i = 0; i < times; i++) PostKey(focus, vk);
            done["method"] = "key_message";
            return Json(done);
          }
          // A shortcut reads the real state of Ctrl/Shift/Alt: only in front.
          bool moved = InFront(top, delegate {
            for (int i = 0; i < times; i++) {
              if (control) keybd_event(0x11, 0, 0, UIntPtr.Zero);
              if (shift) keybd_event(0x10, 0, 0, UIntPtr.Zero);
              if (alt) keybd_event(0x12, 0, 0, UIntPtr.Zero);
              if (win) keybd_event(0x5B, 0, 0, UIntPtr.Zero);
              keybd_event((byte)vk, 0, 0, UIntPtr.Zero);
              keybd_event((byte)vk, 0, 2, UIntPtr.Zero);
              if (win) keybd_event(0x5B, 0, 2, UIntPtr.Zero);
              if (alt) keybd_event(0x12, 0, 2, UIntPtr.Zero);
              if (shift) keybd_event(0x10, 0, 2, UIntPtr.Zero);
              if (control) keybd_event(0x11, 0, 2, UIntPtr.Zero);
              Thread.Sleep(20);
            }
          });
          done["method"] = "key_in_front";
          if (moved) done["brought_forward_briefly"] = true;
          return Json(done);
        }
        case "type": {
          if (string.IsNullOrEmpty(text)) return Json(Fail("no_text", null));
          IntPtr native = element != null ? NativeOf(element, IntPtr.Zero) : IntPtr.Zero;
          if (native == IntPtr.Zero || native == top) native = FocusOf(top);
          if (IsEdit(native)) {
            // A Win32 edit box takes text where its caret is, by message, in front or not.
            SendMessage(native, EM_REPLACESEL, new IntPtr(1), text.Replace("\n", "\r\n"));
            done["method"] = "replace_selection"; return Json(done);
          }
          if (element != null) {
            object valuePattern = Pattern(element, ValuePattern.Pattern);
            object textPattern = Pattern(element, TextPattern.Pattern);
            if (valuePattern != null && textPattern == null && !((ValuePattern)valuePattern).Current.IsReadOnly) {
              ValuePattern pattern = (ValuePattern)valuePattern;
              pattern.SetValue((pattern.Current.Value ?? "") + text);
              done["method"] = "append_value"; return Json(done);
            }
          }
          PostText(native, text);
          done["method"] = "char_messages";
          return Json(done);
        }
        case "scroll": {
          AutomationElement current = element;
          TreeWalker walker = TreeWalker.ControlViewWalker;
          while (current != null) {
            object scroll = Pattern(current, ScrollPattern.Pattern);
            if (scroll != null) {
              ScrollPattern pattern = (ScrollPattern)scroll;
              for (int i = 0; i < Math.Abs(dy) && pattern.Current.VerticallyScrollable; i++)
                pattern.Scroll(ScrollAmount.NoAmount, dy > 0 ? ScrollAmount.SmallIncrement : ScrollAmount.SmallDecrement);
              for (int i = 0; i < Math.Abs(dx) && pattern.Current.HorizontallyScrollable; i++)
                pattern.Scroll(dx > 0 ? ScrollAmount.SmallIncrement : ScrollAmount.SmallDecrement, ScrollAmount.NoAmount);
              done["method"] = "scroll_pattern"; return Json(done);
            }
            try { current = walker.GetParent(current); } catch (Exception) { break; }
            if (current == AutomationElement.RootElement) break;
          }
          int px = (int)x, py = (int)y;
          if (element != null) {
            System.Windows.Rect rect = element.Current.BoundingRectangle;
            px = (int)(rect.X + rect.Width / 2); py = (int)(rect.Y + rect.Height / 2);
          } else if (!hasPoint) {
            RECT rect; GetWindowRect(top, out rect); px = (rect.Left + rect.Right) / 2; py = (rect.Top + rect.Bottom) / 2;
          }
          POINT client = new POINT(); client.X = px; client.Y = py;
          ScreenToClient(top, ref client);
          IntPtr child = ChildWindowFromPointEx(top, client, 0x0001 | 0x0004);
          IntPtr target = child == IntPtr.Zero ? top : child;
          if (dy != 0) PostMessage(target, WM_MOUSEWHEEL, new IntPtr((-120 * dy) << 16), LParam(px, py));
          if (dx != 0) PostMessage(target, WM_MOUSEHWHEEL, new IntPtr((120 * dx) << 16), LParam(px, py));
          done["method"] = "wheel_message";
          return Json(done);
        }
        case "raise":
          InFront(top, delegate { });
          SetForegroundWindow(top);
          done["method"] = "raise";
          return Json(done);
      }
    } catch (Exception error) {
      return Json(Fail("action_failed", error.Message));
    }
    return Json(Fail("unknown_op", op));
  }

  public static void PasteTo(IntPtr top, AutomationElement element, Dictionary<string, object> done) {
    IntPtr native = element != null ? NativeOf(element, IntPtr.Zero) : IntPtr.Zero;
    if (native == IntPtr.Zero || native == top) native = FocusOf(top);
    if (IsEdit(native)) {
      SendMessage(native, WM_PASTE, IntPtr.Zero, IntPtr.Zero);
      done["method"] = "paste_message";
      return;
    }
    bool moved = InFront(top, delegate {
      keybd_event(0x11, 0, 0, UIntPtr.Zero);
      keybd_event(0x56, 0, 0, UIntPtr.Zero);
      keybd_event(0x56, 0, 2, UIntPtr.Zero);
      keybd_event(0x11, 0, 2, UIntPtr.Zero);
    });
    done["method"] = "paste_in_front";
    if (moved) done["brought_forward_briefly"] = true;
  }
}
`;

/** The script's start: UTF-8 out, the C# above, the request. */
function prelude(request: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  return `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Out-Answer([string]$json) { [Console]::Out.WriteLine($json) }
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Drawing, System.Windows.Forms
  Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Drawing -TypeDefinition @'
${CSHARP}
'@
} catch {
  Out-Answer ('{"error":"compile_failed","message":' + (ConvertTo-Json ([string]$_.Exception.Message)) + '}')
  exit
}
[MraiApps]::SetProcessDPIAware() | Out-Null
$req = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
function Num($value, $default) { if ($null -eq $value -or $value -eq '') { return $default } return [double]$value }
function Str($value) { if ($null -eq $value) { return '' } return [string]$value }
`;
}

/** Where the app is: running (its process or window), or started now, in the background where it can be. */
const FIND_TARGET = `
$t = $req.target
$targetPid = [int](Num $t.pid 0)
$exe = Str $t.path
$hwnd = [long](Num $t.hwnd 0)
$title = ''
$launched = $false
$count = [MraiApps]::CountWindows($targetPid, $exe, $title)
if ($count -eq 0 -and -not $t.running -and $t.id) {
  $before = [MraiApps]::GetForegroundWindow()
  $id = [string]$t.id
  if ($id -match '^[A-Za-z]:\\\\' -or $id -match '\\.exe$') { Start-Process -FilePath $id } else { Start-Process ('shell:AppsFolder\\' + $id) }
  $launched = $true
  $name = Str $t.name
  $launchedExe = $(if ($id -match '\\.exe$') { $id } else { '' })
  for ($i = 0; $i -lt 40 -and $count -eq 0; $i++) {
    Start-Sleep -Milliseconds 250
    $count = [MraiApps]::CountWindows(0, $launchedExe, $name)
  }
  if ($count -gt 0) { $exe = $launchedExe }
  # The person's window back in front: the app was opened for the AI, not for them.
  if ($before -ne [IntPtr]::Zero) { [MraiApps]::SetForegroundWindow($before) | Out-Null }
}
`;

const BODIES: Record<string, string> = {
  locked: `Out-Answer ([MraiApps]::Locked())`,
  apps: `
$start = @()
try { $start = @(Get-StartApps | ForEach-Object { [string]$_.Name + "\`t" + [string]$_.AppID }) } catch { }
Out-Answer ([MraiApps]::Apps([string[]]$start))`,
  state: `${FIND_TARGET}
if ($count -eq 0) {
  Out-Answer ('{"app":{"name":' + (ConvertTo-Json (Str $t.name)) + ',"id":' + (ConvertTo-Json (Str $t.id)) + '},"windows":[],"nodes":[],"launched":' + $(if ($launched) { 'true' } else { 'false' }) + '}')
  exit
}
$pidFound = [MraiApps]::CountWindows($targetPid, $exe, $title)
$wantedWindow = $(if ($req.window) { Str $req.window } elseif ($t.window) { Str $t.window } else { '' })
$json = [MraiApps]::State($targetPid, $exe, $(if ($pidFound -eq 0) { Str $t.name } else { '' }), $hwnd, $wantedWindow, [int](Num $req.limit 900), (Str $t.name), (Str $t.id))
if ($launched) { $json = $json.Substring(0, $json.Length - 1) + ',"launched":true}' }
Out-Answer $json`,
  shot: `Out-Answer ([MraiApps]::Shot([long](Num $req.hwnd 0), [string]$req.file, [int](Num $req.width 800), [int](Num $req.height 600)))`,
  act: `
$t = $req.target
$wantedWindow = $(if ($req.window) { Str $req.window } elseif ($t.window) { Str $t.window } else { '' })
$window = [MraiApps]::Window([int](Num $t.pid 0), (Str $t.path), '', [long](Num $t.hwnd 0), $wantedWindow)
if ($null -eq $window) { $window = [MraiApps]::Window(0, '', (Str $t.name), [long](Num $t.hwnd 0), $wantedWindow) }
if ($null -eq $window) { Out-Answer '{"error":"no_window","message":"The app has no window open: read it again (get_app_state)."}'; exit }
$op = Str $req.op
if ($op -eq 'paste') {
  # The person's clipboard, every format it holds, put back after.
  $saved = $null
  try { $saved = [System.Windows.Forms.Clipboard]::GetDataObject() } catch { }
  $kept = New-Object System.Windows.Forms.DataObject
  if ($saved) { foreach ($format in $saved.GetFormats($false)) { try { $kept.SetData($format, $saved.GetData($format)) } catch { } } }
  [System.Windows.Forms.Clipboard]::SetText((Str $req.text))
  $done = New-Object 'System.Collections.Generic.Dictionary[string,object]'
  $done['ok'] = $true
  $element = $null
  if ($req.element) { $element = [MraiApps]::Find($window, [string]$req.element) }
  [MraiApps]::PasteTo([IntPtr][long]$window.Current.NativeWindowHandle, $element, $done)
  Start-Sleep -Milliseconds 400
  try { if ($saved) { [System.Windows.Forms.Clipboard]::SetDataObject($kept, $true) } else { [System.Windows.Forms.Clipboard]::Clear() }; $done['clipboard_restored'] = $true } catch { $done['clipboard_restored'] = $false }
  Out-Answer ([MraiApps]::Json($done))
  exit
}
$hasPoint = ($null -ne $req.x -and $null -ne $req.y)
Out-Answer ([MraiApps]::Act($window, (Str $req.element), $op, (Str $req.text), (Str $req.value), (Str $req.key), $(if ($req.button) { [string]$req.button } else { 'left' }),
  [int](Num $req.count 1), [int](Num $req.repeat 1), (Num $req.x 0), (Num $req.y 0), (Num $req.to_x 0), (Num $req.to_y 0),
  [int](Num $req.dx 0), [int](Num $req.dy 0), (Str $req.name), [int](Num $req.start 0), [int](Num $req.length 0), $hasPoint))`,
};

/** The whole script of one step (op: locked, apps, state, shot, act). */
export function winScript(op: string, request: Record<string, unknown>): string {
  const body = BODIES[op];
  if (!body) throw new Error(`unknown windows op ${op}`);
  return `${prelude(request)}
try {
${body}
} catch {
  Out-Answer ('{"error":"failed","message":' + (ConvertTo-Json ([string]$_.Exception.Message)) + '}')
}
`;
}

export const WIN_OPS = Object.keys(BODIES);
