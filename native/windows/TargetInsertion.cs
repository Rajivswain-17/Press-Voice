#if PRESS_TIER_A_FIXTURE
using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

// Only metadata is inspected. No window titles, document content or clipboard access.
internal static class TargetInsertion
{
    [StructLayout(LayoutKind.Sequential)]
    struct Gui { public int size, flags; public IntPtr active, focus, capture, menu, move, caret; public int left, top, right, bottom; }
    delegate void Event(IntPtr hook, uint kind, IntPtr window, int obj, int child, uint thread, uint time);
    static readonly Event OnEvent = Changed;
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,Event fn,uint pid,uint tid,uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
    [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread,ref Gui gui);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int size);
    [DllImport("user32.dll")] static extern int GetWindowLongW(IntPtr hwnd,int index);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetPackageFamilyName(IntPtr process,ref int size,StringBuilder family);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token,int type,IntPtr data,int size,out int needed);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW")] static extern IntPtr Selection(IntPtr hwnd,uint msg,out int start,out int end,uint flags,uint ms,out IntPtr result);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern IntPtr SendMessageTimeoutW(IntPtr hwnd,uint msg,IntPtr undo,string text,uint flags,uint ms,out IntPtr result);

    delegate IntPtr Mouse(int code,IntPtr message,IntPtr data);
    static readonly Mouse OnMouse = MouseEvent;
    [DllImport("user32.dll",EntryPoint="SetWindowsHookExW")] static extern IntPtr SetMouseHook(int type,Mouse callback,IntPtr module,uint thread);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr msg,IntPtr data);
    static IntPtr MouseEvent(int code,IntPtr msg,IntPtr data)
    {
        // Button presses can move the caret or change tabs. Never inspect coordinates.
        int m = msg.ToInt32();
        if (code >= 0 && (m == 0x201 || m == 0x204 || m == 0x207 || m == 0x20B)) Invalidate();
        return CallNextHookEx(IntPtr.Zero,code,msg,data);
    }
    static int inspectionBusy, deliveryBusy;
    static bool available;
    internal static readonly bool Diagnostics = Environment.GetEnvironmentVariable("PRESS_2E_DIAGNOSTICS") == "1";

    static void Trace(int id, string stage, Snapshot snapshot)
    {
        if (!Diagnostics) return;
        Console.Error.WriteLine("TRACE edit session=" + id + " " + stage +
            (snapshot == null ? " unavailable" : " start=" + snapshot.start + " end=" + snapshot.end + " generation=" + snapshot.stamp));
    }
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    static bool ModifiersReleased()
    {
        foreach (int key in new int[]{16,17,18,91,92}) if (GetAsyncKeyState(key) < 0) return false;
        return true;
    }
    static long generation;
    static int edge, ticket, lastId;
    static long edgeGeneration;
    static IntPtr edgeRoot, edgeEditor;
    static Snapshot original;
    static readonly object Gate = new object();

    internal static void Install()
    {
        // Foreground transitions, object focus, selection and changes to the selection set.
        available = SetMouseHook(14,OnMouse,GetModuleHandle(null),0) != IntPtr.Zero &&
            SetWinEventHook(3,3,IntPtr.Zero,OnEvent,0,0,0) != IntPtr.Zero &&
            SetWinEventHook(0x8005,0x8009,IntPtr.Zero,OnEvent,0,0,0) != IntPtr.Zero &&
            SetWinEventHook(0x8014,0x8014,IntPtr.Zero,OnEvent,0,0,0) != IntPtr.Zero &&
            SetWinEventHook(0x800E,0x800E,IntPtr.Zero,OnEvent,0,0,0) != IntPtr.Zero;
    }
    static void Changed(IntPtr hook,uint kind,IntPtr window,int obj,int child,uint thread,uint time)
    {
        if (kind == 3 || kind == 0x8005 || window == edgeEditor || window == edgeRoot ||
            (window != IntPtr.Zero && GetAncestor(window,2) == edgeRoot)) Invalidate();
    }
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
    internal static void Invalidate() { Interlocked.Increment(ref generation); }
    static IntPtr Focus(IntPtr root)
    {
        uint pid;
        uint tid = GetWindowThreadProcessId(root,out pid);
        Gui g = new Gui(); g.size = Marshal.SizeOf(g);
        return tid != 0 && GetGUIThreadInfo(tid,ref g) && g.active == root ? g.focus : IntPtr.Zero;
    }
    internal static void Edge()
    {
        // Only cheap HWND/stamp reads on the low-level keyboard hook.
        lock (Gate) {
            edge++;
            edgeGeneration = Interlocked.Read(ref generation);
            edgeRoot = GetForegroundWindow();
            edgeEditor = Focus(edgeRoot);
        }
    }
    static string Class(IntPtr handle)
    {
        var name = new StringBuilder(128);
        return GetClassName(handle,name,name.Capacity) > 0 ? name.ToString() : "";
    }
    static bool Medium(Process process)
    {
        IntPtr token;
        if (!OpenProcessToken(process.Handle,8,out token)) return false;
        IntPtr data = Marshal.AllocHGlobal(256);
        try {
            int needed;
            if (!GetTokenInformation(token,25,data,256,out needed)) return false;
            IntPtr sid = Marshal.ReadIntPtr(data);
            byte count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
            return count > 0 && Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)count-1)) == 0x2000;
        } finally { Marshal.FreeHGlobal(data); CloseHandle(token); }
    }
    internal sealed class Snapshot
    {
        internal IntPtr root, editor, parent;
        internal uint pid;
        internal long birth, stamp;
        internal int start,end;
        internal int[] tab;
        internal bool Matches(Snapshot other)
        {
            return other != null && root == other.root && editor == other.editor && parent == other.parent &&
                pid == other.pid && birth == other.birth && stamp == other.stamp && start == other.start &&
                end == other.end && tab != null && other.tab != null && tab.SequenceEqual(other.tab);
        }
    }
    internal static bool Eligible(int style,object password,object readOnly,object rangeReadOnly)
    {
        return style != 0 && (style & 0x820) == 0 && Equals(password,false) &&
            Equals(readOnly,false) && Equals(rangeReadOnly,false);
    }
    static Snapshot Inspect(IntPtr root,IntPtr editor,long stamp)
    {
        if (!available || stamp != Interlocked.Read(ref generation) || GetForegroundWindow() != root ||
            root == IntPtr.Zero || editor == IntPtr.Zero || Focus(root) != editor) return null;
        IntPtr parent = GetParent(editor);
        if (GetParent(parent) != root || Class(root) != "Notepad" || Class(parent) != "NotepadTextBox" ||
            Class(editor) != "RichEditD2DPT") return null;
        uint pid, editorPid, parentPid;
        GetWindowThreadProcessId(root,out pid); GetWindowThreadProcessId(editor,out editorPid);
        GetWindowThreadProcessId(parent,out parentPid);
        if (pid != editorPid || pid != parentPid) return null;
        long birth;
        using (Process p = Process.GetProcessById((int)pid))
        using (Process self = Process.GetCurrentProcess()) {
            int n = 128; var family = new StringBuilder(n);
            if (!Medium(p) || !Medium(self) || p.SessionId != self.SessionId ||
                GetPackageFamilyName(p.Handle,ref n,family) != 0 || family.ToString() != "Microsoft.WindowsNotepad_8wekyb3d8bbwe" ||
                !String.Equals(p.ProcessName,"Notepad",StringComparison.OrdinalIgnoreCase) ||
                p.MainModule.FileVersionInfo.FileVersion != "11.2607.14.0") return null;
            birth = p.StartTime.ToFileTimeUtc();
        }
        var doc = AutomationElement.FromHandle(editor);
        if (doc.Current.ProcessId != pid || doc.Current.NativeWindowHandle != editor.ToInt32() ||
            doc.Current.ControlType != ControlType.Document || doc.Current.FrameworkId != "Win32" ||
            !doc.Current.HasKeyboardFocus || !doc.Current.IsEnabled) return null;
        object pattern;
        if (!doc.TryGetCurrentPattern(TextPattern.Pattern,out pattern)) return null;
        var selection = ((TextPattern)pattern).GetSelection();
        if (selection.Length != 1 || !Eligible(GetWindowLongW(editor,-16),
            doc.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty,true),
            doc.GetCurrentPropertyValue(ValuePattern.IsReadOnlyProperty,true),
            selection[0].GetAttributeValue(TextPattern.IsReadOnlyAttribute))) return null;
        var tabs = AutomationElement.FromHandle(root).FindAll(TreeScope.Descendants,
            new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.TabItem));
        int[] tab = null;
        foreach (AutomationElement item in tabs) {
            object selected = item.GetCurrentPropertyValue(SelectionItemPattern.IsSelectedProperty,true);
            if (!(selected is bool)) return null;
            if (!(bool)selected) continue;
            if (tab != null || item.Current.ProcessId != pid) return null;
            tab = item.GetRuntimeId();
        }
        int start,end; IntPtr result;
        if (tab == null || tab.Length == 0 || Selection(editor,0xB0,out start,out end,0x23,150,out result) == IntPtr.Zero ||
            start < 0 || end < start || Focus(root) != editor || GetForegroundWindow() != root ||
            stamp != Interlocked.Read(ref generation)) return null;
        return new Snapshot { root=root, editor=editor, parent=parent, pid=pid, birth=birth, stamp=stamp,
            start=start,end=end,tab=tab };
    }
    internal static bool ReplaceSelection(IntPtr editor,string text)
    {
        IntPtr result;
        return SendMessageTimeoutW(editor,0xC2,new IntPtr(1),text,0x23,750,out result) != IntPtr.Zero;
    }

    static bool Revalidate(int id, Snapshot target)
    {
        Snapshot current = Inspect(target.root,target.editor,target.stamp);
        bool matches = target.Matches(current);
        Trace(id, matches ? "match" : "mismatch", current);
        return matches;
    }

    internal static bool Command(string[] parts,Action<string> emit)
    {
        if (parts.Length == 2 && parts[0] == "DISARM") {
            int session;
            if (int.TryParse(parts[1],out session)) lock (Gate) {
                if (session == lastId) { Invalidate(); ticket = 0; original = null; }
            }
            return true;
        }
        if (parts.Length != 3) return false;
        int id;
        if (!int.TryParse(parts[1],out id) || id <= 0) return true;
        if (parts[0] == "ARM") {
            int which; IntPtr root,editor; long stamp;
            lock (Gate) {
                if (id <= lastId) return true;
                lastId = ticket = id; original = null;
                if (!int.TryParse(parts[2],out which) || which != edge) return true;
                root=edgeRoot; editor=edgeEditor; stamp=edgeGeneration;
            }
            if (Interlocked.Exchange(ref inspectionBusy,1) != 0) return true;
            ThreadPool.QueueUserWorkItem(delegate {
                try {
                    Snapshot found = Inspect(root,editor,stamp);
                    Trace(id, "capture", found);
                    lock (Gate) if (ticket == id) original = found;
                } catch (Exception) { /* Missing metadata is ineligible. */ }
                finally { Interlocked.Exchange(ref inspectionBusy,0); }
            });
        } else if (parts[0] == "INSERT") {
            Snapshot target;
            lock (Gate) {
                target = ticket == id ? original : null;
                if (ticket == id) { ticket=0; original=null; }
            }
            if (Interlocked.Exchange(ref deliveryBusy,1) != 0) { emit("EDIT " + id + " REFUSED"); return true; }
            var elapsed = Stopwatch.StartNew();
            ThreadPool.QueueUserWorkItem(delegate {
                string status = "REFUSED";
                try {
                    string text = parts[2].Length <= 44000 ? new UTF8Encoding(false,true).GetString(Convert.FromBase64String(parts[2])) : "";
                    if (target != null && text.Length > 0 && text.Length <= 8192 &&
                        !System.Text.RegularExpressions.Regex.IsMatch(text,@"[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]") &&
                        Revalidate(id, target) && elapsed.ElapsedMilliseconds < 1400 &&
                        target.stamp == Interlocked.Read(ref generation) && GetForegroundWindow() == target.root &&
                        Focus(target.root) == target.editor && ModifiersReleased()) {
                        status = "UNKNOWN";
                        if (ReplaceSelection(target.editor,text))
                            status = "DELIVERED";
                    }
                } catch (Exception) { /* Preserve UNKNOWN once dispatch has begun. */ }
                finally { Interlocked.Exchange(ref deliveryBusy,0); }
                Trace(id, status, target);
                emit("EDIT " + id + " " + status);
            });
        }
        return true;
    }
}
#else
// Production Phase 2 companion has no native editor API or target capture.
internal static class TargetInsertion
{
    internal static readonly bool Diagnostics = false;
    internal static void Edge() {}
    internal static void Invalidate() {}
    internal static void Install() {}
    internal static bool Command(string[] parts, System.Action<string> emit)
    {
        if (parts.Length == 0 || parts[0] != "INSERT") return false;
        int id;
        if (parts.Length > 1 && int.TryParse(parts[1],out id) && id > 0)
            emit("EDIT " + id + " REFUSED");
        return true;
    }
}
#endif
