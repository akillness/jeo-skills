// fast-anything: calls the verified Rust port of /*ID*/. Generated; remove with  fast-anything disable /*ID*/
// FAST_ANYTHING_DISABLE=1 runs the C# version instead.
#nullable enable
#pragma warning disable
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Runtime.InteropServices;

static class /*CLASS*/
{
    public static readonly bool On;

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    delegate IntPtr FaCall(byte[] input, UIntPtr len, out UIntPtr outLen);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    delegate void FaFree(IntPtr ptr, UIntPtr len);

    static readonly FaCall? CallFn;
    static readonly FaFree? FreeFn;

    static /*CLASS*/()
    {
        if (Environment.GetEnvironmentVariable("FAST_ANYTHING_DISABLE") != null) return;
        try
        {
            var lib = NativeLibrary.Load(/*LIB*/);
            CallFn = Marshal.GetDelegateForFunctionPointer<FaCall>(NativeLibrary.GetExport(lib, "fa_call"));
            FreeFn = Marshal.GetDelegateForFunctionPointer<FaFree>(NativeLibrary.GetExport(lib, "fa_free"));
            On = true;
        }
        catch (Exception)
        {
            On = false;
        }
    }

    public static object? Call(object?[] args, Type type)
    {
        byte[] input = Encoding.UTF8.GetBytes(Json.Enc(args));
        IntPtr p = CallFn!(input, (UIntPtr)input.Length, out UIntPtr n);
        var reply = new byte[(int)n];
        Marshal.Copy(p, reply, 0, reply.Length);
        FreeFn!(p, n);
        using var doc = JsonDocument.Parse(reply);
        if (doc.RootElement.TryGetProperty("error", out var e)) throw new InvalidOperationException("fast-anything: " + e);
        return JsonSerializer.Deserialize(doc.RootElement.GetProperty("ok"), type, Json.Options);
    }

/*JSON*/
}
