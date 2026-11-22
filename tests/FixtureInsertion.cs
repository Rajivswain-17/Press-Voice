using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// Separate test executable. Its only destination is the hidden child it launches.
internal static class FixtureInsertion
{
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] static extern int GetWindowLongW(IntPtr h,int index);
    [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW")] static extern IntPtr Selection(IntPtr h,uint m,out int a,out int b,uint flags,uint ms,out IntPtr result);
    static void Require(bool ok) { if (!ok) throw new Exception("Disposable fixture assertion failed."); }

    static void Child(string mode)
    {
        using (var form = new Form())
        using (var box = new TextBox()) {
            form.Controls.Add(box);
            box.Text = mode == "caret" ? "LEFT[]RIGHT" : "LEFT[old]RIGHT";
            box.ReadOnly = mode == "readonly";
            box.UseSystemPasswordChar = mode == "password";
            var root = form.Handle;
            var editor = box.Handle;
            box.Select(5,mode == "caret" ? 0 : 3);
            Console.WriteLine(root.ToInt64() + " " + editor.ToInt64());
            new Thread(delegate() {
                string line;
                while ((line = Console.ReadLine()) != null) {
                    string command = line;
                    form.Invoke((Action)delegate {
                        if (command == "MOVE") box.Select(0,0);
                        else if (command == "UNDO") box.Undo();
                        else if (command.StartsWith("CHECK ")) {
                            string expected = Encoding.UTF8.GetString(Convert.FromBase64String(command.Substring(6)));
                            Console.WriteLine(box.Text == expected ? "OK" : "FAIL");
                            return;
                        }
                        Console.WriteLine("OK");
                    });
                }
                form.BeginInvoke((Action)Application.ExitThread);
            }) { IsBackground = true }.Start();
            Application.Run();
        }
    }

    static void CheckLine(Process child,string command)
    {
        child.StandardInput.WriteLine(command);
        var read = child.StandardOutput.ReadLineAsync();
        Require(read.Wait(3000) && read.Result == "OK");
    }
    static void CheckText(Process child,string text)
    {
        CheckLine(child,"CHECK " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
    }
    static TargetInsertion.Snapshot Capture(Process child,IntPtr root,IntPtr editor,long birth)
    {
        uint pid=0,parentPid;
        Require(!child.HasExited && child.StartTime.ToFileTimeUtc() == birth &&
            GetWindowThreadProcessId(editor,out pid) != 0 && pid == child.Id &&
            GetWindowThreadProcessId(root,out parentPid) != 0 && parentPid == pid && GetParent(editor) == root);
        int a,b; IntPtr result;
        Require(Selection(editor,0xB0,out a,out b,0x23,300,out result) != IntPtr.Zero);
        return new TargetInsertion.Snapshot { root=root,editor=editor,parent=root,pid=pid,birth=birth,start=a,end=b,tab=new int[]{1} };
    }
    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "child") { Child(args[1]); return; }
        string text = Encoding.UTF8.GetString(Convert.FromBase64String(Console.ReadLine()));
        foreach (string mode in new string[]{"caret","selection","stale","readonly","password"}) {
            var info = new ProcessStartInfo(Application.ExecutablePath,"child " + mode) {
                UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true };
            using (var child = Process.Start(info)) try {
                long birth=child.StartTime.ToFileTimeUtc();
                var hello=child.StandardOutput.ReadLineAsync(); Require(hello.Wait(4000));
                string[] handles=hello.Result.Split(' ');
                IntPtr root=new IntPtr(long.Parse(handles[0])), editor=new IntPtr(long.Parse(handles[1]));
                var original=Capture(child,root,editor,birth);
                Require(original.start == 5 && original.end == (mode == "caret" ? 5 : 8));
                if (mode == "stale") CheckLine(child,"MOVE");
                var current=Capture(child,root,editor,birth);
                bool eligible=TargetInsertion.Eligible(GetWindowLongW(editor,-16),false,false,false);
                bool send=original.Matches(current) && eligible;
                Require(send == (mode == "caret" || mode == "selection"));
                uint clipboard=GetClipboardSequenceNumber();
                if (send) {
                    Require(TargetInsertion.ReplaceSelection(editor,text));
                    CheckText(child,"LEFT[" + text + "]RIGHT");
                    Require(clipboard != 0 && GetClipboardSequenceNumber() == clipboard);
                    CheckLine(child,"UNDO");
                }
                CheckText(child,mode == "caret" ? "LEFT[]RIGHT" : "LEFT[old]RIGHT");
                Console.WriteLine("PASS " + mode);
            } finally {
                child.StandardInput.Close();
                if (!child.WaitForExit(2000)) { child.Kill(); child.WaitForExit(); }
            }
        }
    }
}
