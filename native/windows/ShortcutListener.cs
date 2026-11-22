using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal static class ShortcutListener
{
    private delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
    private static readonly Hook Callback = OnKeyboard;
    private static readonly BlockingCollection<string> Events = new BlockingCollection<string>(32);
    private static readonly HashSet<int> Pressed = new HashSet<int>();
    private static int[] binding;
    private static bool active;
    private static bool armed = true;
    private static uint ownerThread;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int type, Hook callback, IntPtr module, uint thread);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")]
    private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern bool PeekMessage(IntPtr message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    private static bool IsModifier(int key) { return key >= 160 && key <= 165; }
    private static bool IsFunction(int key) { return key >= 112 && key <= 135 && key != 123; }

    private static bool ParseBinding(string[] arguments)
    {
        if (arguments.Length < 1 || arguments.Length > 4) return false;
        binding = new int[arguments.Length];
        for (int i = 0; i < arguments.Length; i++)
            if (!int.TryParse(arguments[i], out binding[i]) || !(IsModifier(binding[i]) || IsFunction(binding[i])))
                return false;
        if (binding.Length == 1 && (binding[0] == 162 || binding[0] == 163)) return true;
        if (binding.Count(IsFunction) != 1 ||
            binding.Where(IsModifier).Select(key => (key - 160) / 2).Distinct().Count() != binding.Length - 1)
            return false;
        return !binding.Contains(115) || !binding.Any(key => key >= 162 && key <= 165);
    }

    private static void Emit(string signal)
    {
        if (!Events.TryAdd(signal)) Quit();
    }

    private static void Quit() { PostThreadMessage(ownerThread, 0x0012, UIntPtr.Zero, IntPtr.Zero); }

    private static IntPtr OnKeyboard(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0 && (Marshal.ReadInt32(data, 8) & 0x10) == 0)
        {
            int key = Marshal.ReadInt32(data);
            int kind = message.ToInt32();
            if (kind == 0x0100 || kind == 0x0104)
            {
                if (Pressed.Add(key) && armed && Pressed.SetEquals(binding))
                {
                    armed = false;
                    active = true;
                    Emit("DOWN");
                }
            }
            else if (kind == 0x0101 || kind == 0x0105)
            {
                Pressed.Remove(key);
                if (active && Array.IndexOf(binding, key) >= 0)
                {
                    active = false;
                    Emit("UP");
                }
                if (!binding.Any(Pressed.Contains)) armed = true;
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, message, data);
    }

    private static bool CheckReservation()
    {
        int key = Array.Find(binding, IsFunction);
        if (key == 0) return true;
        uint modifiers = 0x4000;
        foreach (int member in binding)
        {
            if (member == 160 || member == 161) modifiers |= 4;
            if (member == 162 || member == 163) modifiers |= 2;
            if (member == 164 || member == 165) modifiers |= 1;
        }
        if (!RegisterHotKey(IntPtr.Zero, 1, modifiers, (uint)key)) return false;
        return UnregisterHotKey(IntPtr.Zero, 1);
    }

    [STAThread]
    private static int Main(string[] arguments)
    {
        if (!ParseBinding(arguments)) { Console.WriteLine("INVALID"); return 2; }
        if (binding.Any(key => GetAsyncKeyState(key) < 0)) { Console.WriteLine("HELD"); return 3; }
        if (!CheckReservation()) { Console.WriteLine("CONFLICT"); return 4; }
        ownerThread = GetCurrentThreadId();
        IntPtr message = Marshal.AllocHGlobal(64);
        try { PeekMessage(message, IntPtr.Zero, 0, 0, 0); }
        finally { Marshal.FreeHGlobal(message); }
        for (int key = 8; key <= 254; key++)
            if (key != 16 && key != 17 && key != 18 && GetAsyncKeyState(key) < 0) Pressed.Add(key);
        IntPtr hook = SetWindowsHookEx(13, Callback, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) { Console.WriteLine("UNAVAILABLE"); return 5; }
        Thread send = new Thread(() => {
            try { foreach (string signal in Events.GetConsumingEnumerable()) Console.WriteLine(signal); }
            catch (System.IO.IOException) { Quit(); }
        });
        send.IsBackground = true;
        send.Start();
        Emit("READY 1");
        Thread receive = new Thread(() => {
            try { Console.ReadLine(); }
            catch (System.IO.IOException) {}
            finally { Quit(); }
        });
        receive.IsBackground = true;
        receive.Start();
        try { Application.Run(); }
        finally { UnhookWindowsHookEx(hook); }
        return 0;
    }
}
