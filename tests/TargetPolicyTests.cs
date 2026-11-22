using System;

// Pure policy tests. No hooks are installed and no Windows messages are sent.
internal static class TargetPolicyTests
{
    static TargetInsertion.Snapshot Example()
    {
        return new TargetInsertion.Snapshot { root=(IntPtr)1, editor=(IntPtr)2, parent=(IntPtr)3,
            pid=4, birth=5, stamp=6, start=7, end=8, tab=new int[]{9,10} };
    }
    static void Check(bool value) { if (!value) throw new Exception("Target policy assertion failed."); }
    static void Main()
    {
        var original = Example();
        Check(original.Matches(Example()));
        Action<TargetInsertion.Snapshot>[] changes = {
            x => x.editor=IntPtr.Zero, x => x.root=IntPtr.Zero, x => x.parent=IntPtr.Zero,
            x => x.birth++, x => x.pid++, x => x.stamp++, x => x.start++, x => x.end++,
            x => x.tab=null, x => x.tab[1]++
        };
        foreach (var change in changes) { var next=Example(); change(next); Check(!original.Matches(next)); }
        Check(!original.Matches(null));
        Check(TargetInsertion.Eligible(1,false,false,false));
        foreach (int style in new int[]{0,0x20,0x800}) Check(!TargetInsertion.Eligible(style,false,false,false));
        foreach (object blocked in new object[]{true,null,new object()}) {
            Check(!TargetInsertion.Eligible(1,blocked,false,false));
            Check(!TargetInsertion.Eligible(1,false,blocked,false));
            Check(!TargetInsertion.Eligible(1,false,false,blocked));
        }
        Console.WriteLine("Native target identity, stale selection, tab and eligibility checks passed.");
    }
}
