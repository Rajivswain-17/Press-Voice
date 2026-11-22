using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

internal sealed class MicrophoneCapture
{
    private const int Rate = 16000;
    private const int Limit = Rate * 2 * 60;
    private const int BufferBytes = 3200;
    private const uint Done = 1;
    private static readonly int HeaderSize = Marshal.SizeOf(typeof(Header));
    private readonly int id;
    private readonly Action<string> emit;
    private volatile bool stopping;
    private volatile bool cancelled;

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    private struct WaveFormat
    {
        public ushort Format, Channels;
        public uint Rate, BytesPerSecond;
        public ushort Alignment, Bits, Extra;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Header
    {
        public IntPtr Data;
        public uint Length, Recorded;
        public UIntPtr User;
        public uint Flags, Loops;
        public IntPtr Next;
        public UIntPtr Reserved;
    }

    private sealed class Packet
    {
        public IntPtr HeaderPointer;
        public IntPtr DataPointer;
        public bool Prepared;
    }

    [DllImport("winmm.dll")] private static extern uint waveInOpen(out IntPtr input, uint device, ref WaveFormat format, IntPtr callback, IntPtr instance, uint flags);
    [DllImport("winmm.dll")] private static extern uint waveInPrepareHeader(IntPtr input, IntPtr header, uint size);
    [DllImport("winmm.dll")] private static extern uint waveInAddBuffer(IntPtr input, IntPtr header, uint size);
    [DllImport("winmm.dll")] private static extern uint waveInStart(IntPtr input);
    [DllImport("winmm.dll")] private static extern uint waveInReset(IntPtr input);
    [DllImport("winmm.dll")] private static extern uint waveInUnprepareHeader(IntPtr input, IntPtr header, uint size);
    [DllImport("winmm.dll")] private static extern uint waveInClose(IntPtr input);

    public MicrophoneCapture(int id, Action<string> emit) { this.id = id; this.emit = emit; }
    public void Stop() { stopping = true; }
    public void Cancel() { cancelled = true; stopping = true; }

    private static void Check(uint result)
    {
        if (result != 0) throw new IOException("Windows audio error " + result);
    }

    public void Run(Action released)
    {
        string result;
        try { result = Capture(); }
        catch (IOException) { result = "MIC_ERROR"; }
        catch (InvalidOperationException) { result = "MIC_ERROR"; }
        finally { released(); }
        if (cancelled) emit("CANCELLED " + id);
        else emit(result.StartsWith("WAV ") ? result : result + " " + id);
    }

    private string Capture()
    {
        if (cancelled) return "CANCELLED";
        var format = new WaveFormat { Format = 1, Channels = 1, Rate = Rate, BytesPerSecond = 2 * Rate, Alignment = 2, Bits = 16 };
        IntPtr input;
        uint open = waveInOpen(out input, uint.MaxValue, ref format, IntPtr.Zero, IntPtr.Zero, 0);
        if (open != 0) return open == 32 ? "MIC_FORMAT" : "MIC_UNAVAILABLE";
        var packets = new List<Packet>();
        var queued = new Queue<Packet>();
        var scratch = new byte[BufferBytes];
        using (var pcm = new MemoryStream())
        {
            try
            {
                if (cancelled) return "CANCELLED";
                for (int i = 0; i < 4; i++)
                {
                    var packet = new Packet();
                    packets.Add(packet);
                    packet.DataPointer = Marshal.AllocHGlobal(BufferBytes);
                    packet.HeaderPointer = Marshal.AllocHGlobal(HeaderSize);
                    Marshal.StructureToPtr(new Header { Data = packet.DataPointer, Length = BufferBytes },
                        packet.HeaderPointer, false);
                    Check(waveInPrepareHeader(input, packet.HeaderPointer, (uint)HeaderSize));
                    packet.Prepared = true;
                    Check(waveInAddBuffer(input, packet.HeaderPointer, (uint)HeaderSize));
                    queued.Enqueue(packet);
                }
                Check(waveInStart(input));
                emit("STARTED " + id);
                var progress = Stopwatch.StartNew();
                while (!stopping && pcm.Length < Limit)
                {
                    Packet next = queued.Peek();
                    Header header = Read(next);
                    if ((header.Flags & Done) == 0)
                    {
                        if (progress.ElapsedMilliseconds > 2000) throw new IOException("Microphone stopped delivering packets.");
                        Thread.Sleep(10);
                        continue;
                    }
                    progress.Restart();
                    queued.Dequeue();
                    Append(pcm, scratch, header);
                    if (pcm.Length >= Limit) break;
                    Check(waveInAddBuffer(input, next.HeaderPointer, (uint)HeaderSize));
                    queued.Enqueue(next);
                }
                Check(waveInReset(input));
                if (!cancelled) foreach (Packet packet in queued) Append(pcm, scratch, Read(packet));
            }
            finally
            {
                uint reset = waveInReset(input);
                bool cleaned = reset == 0;
                foreach (Packet packet in packets)
                {
                    if (packet.Prepared && waveInUnprepareHeader(input, packet.HeaderPointer, (uint)HeaderSize) != 0)
                    {
                        // The driver may still own this buffer. Exit instead of freeing it.
                        cleaned = false;
                        continue;
                    }
                    if (packet.HeaderPointer != IntPtr.Zero) Marshal.FreeHGlobal(packet.HeaderPointer);
                    if (packet.DataPointer != IntPtr.Zero) Marshal.FreeHGlobal(packet.DataPointer);
                }
                uint close = waveInClose(input);
                if (!cleaned || close != 0) Environment.Exit(6);
            }
            if (cancelled) return "CANCELLED";
            if (pcm.Length == 0) return "MIC_EMPTY";
            return "WAV " + id + " " + Convert.ToBase64String(Wav(pcm));
        }
    }

    private static Header Read(Packet packet) { return (Header)Marshal.PtrToStructure(packet.HeaderPointer, typeof(Header)); }

    private static void Append(MemoryStream pcm, byte[] scratch, Header header)
    {
        if ((header.Flags & Done) == 0) return;
        int length = (int)Math.Min(Math.Min(header.Recorded, BufferBytes), Limit - pcm.Length) & ~1;
        if (length == 0) return;
        Marshal.Copy(header.Data, scratch, 0, length);
        pcm.Write(scratch, 0, length);
    }

    private static byte[] Wav(MemoryStream pcm)
    {
        using (var output = new MemoryStream(44 + (int)pcm.Length))
        using (var writer = new BinaryWriter(output))
        {
            writer.Write(0x46464952); writer.Write(36 + (int)pcm.Length);
            writer.Write(0x45564157); writer.Write(0x20746D66); writer.Write(16);
            writer.Write((ushort)1); writer.Write((ushort)1); writer.Write(Rate);
            writer.Write(2 * Rate); writer.Write((ushort)2); writer.Write((ushort)16);
            writer.Write(0x61746164); writer.Write((int)pcm.Length);
            pcm.WriteTo(output);
            return output.ToArray();
        }
    }
}
