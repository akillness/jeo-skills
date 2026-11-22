// Game.Runtime: save slots as versioned JSON files. The save is a FILE, never a ScriptableObject:
// SO writes persist in the Editor and vanish on the next launch of a build (Code Monkey,
// 5a-ztc5gcFw [00:04:17]; proven on this Mac by a macOS player run twice, procedures.md A4).
// - JsonUtility: fields only, no Dictionary, no polymorphism without [SerializeReference]; the DTOs in
//   Game.Core are shaped for it (lists of {itemId, count}).
// - Atomic write: <slot>.json.tmp, then File.Replace keeping <slot>.json.bak; a crash mid-write never
//   destroys the only save. Load falls back to the .bak when the main file is corrupt.
// - Version header read first, older versions migrated (Game.Core.SaveMigrations).
// - SaveAsync serializes on the main thread (Unity API), writes on a background thread
//   (Awaitable.BackgroundThreadAsync) and returns on the main thread. The Web platform has no managed
//   threads (6.3 Manual, Web limits): there the write stays synchronous.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A3).
using System;
using System.IO;
using System.Threading;
using Game.Core;
using UnityEngine;

namespace Game.Runtime
{
    public sealed class SaveService
    {
        public string Directory { get; }
        public int InventoryCapacityForMigration { get; set; } = 20;
        public float MaxHealthForMigration { get; set; } = 100f;

        public SaveService(string directory)
        {
            if (string.IsNullOrEmpty(directory)) throw new ArgumentException("directory");
            Directory = directory;
        }

        /// <summary>Application.persistentDataPath/saves. On macOS:
        /// ~/Library/Application Support/&lt;company&gt;/&lt;product&gt;/saves.</summary>
        public static string DefaultDirectory => Path.Combine(Application.persistentDataPath, "saves");

        public string PathFor(string slot) => Path.Combine(Directory, slot + ".json");

        public void Save(SaveData data, string slot)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            data.version = SaveData.CurrentVersion;
            WriteAtomic(PathFor(slot), JsonUtility.ToJson(data, true));
        }

        public async Awaitable SaveAsync(SaveData data, string slot, CancellationToken token)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            data.version = SaveData.CurrentVersion;
            string json = JsonUtility.ToJson(data, true);   // main thread
            string path = PathFor(slot);
            token.ThrowIfCancellationRequested();
#if UNITY_WEBGL && !UNITY_EDITOR
            WriteAtomic(path, json);                         // no managed threads on the Web
#else
            await Awaitable.BackgroundThreadAsync();         // file IO off the main thread
            WriteAtomic(path, json);
            await Awaitable.MainThreadAsync();               // back before touching Unity objects
#endif
        }

        public enum LoadSource { None, Main, Backup }

        /// <summary>Loads a slot: main file, else its .bak. Migrates older versions. Never throws for a
        /// missing or corrupt file: returns false with the reason.</summary>
        public bool TryLoad(string slot, out SaveData data, out LoadSource source, out string error)
        {
            data = null; source = LoadSource.None; error = null;
            string path = PathFor(slot);
            if (TryParse(path, out data, out error)) { source = LoadSource.Main; return true; }
            string mainError = error;
            if (TryParse(path + ".bak", out data, out error)) { source = LoadSource.Backup; error = mainError; return true; }
            error = mainError ?? error;
            return false;
        }

        public bool Delete(string slot)
        {
            bool any = false;
            foreach (var p in new[] { PathFor(slot), PathFor(slot) + ".bak", PathFor(slot) + ".tmp" })
                if (File.Exists(p)) { File.Delete(p); any = true; }
            return any;
        }

        bool TryParse(string path, out SaveData data, out string error)
        {
            data = null; error = null;
            if (!File.Exists(path)) { error = "missing: " + path; return false; }
            try
            {
                string json = File.ReadAllText(path);
                var header = JsonUtility.FromJson<SaveHeader>(json);
                if (header == null || header.version <= 0) { error = "no version header: " + path; return false; }
                if (header.version == 1)
                    data = SaveMigrations.FromV1(JsonUtility.FromJson<SaveDataV1>(json), InventoryCapacityForMigration, MaxHealthForMigration);
                else if (header.version == SaveData.CurrentVersion)
                    data = JsonUtility.FromJson<SaveData>(json);
                else { error = "unknown save version " + header.version + ": " + path; return false; }
                if (data == null) { error = "empty save: " + path; return false; }
                data.version = SaveData.CurrentVersion;
                return true;
            }
            catch (Exception e) // JsonUtility throws ArgumentException on malformed JSON
            {
                error = e.GetType().Name + ": " + e.Message;
                return false;
            }
        }

        static void WriteAtomic(string path, string contents)
        {
            System.IO.Directory.CreateDirectory(Path.GetDirectoryName(path));
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, contents);
            if (File.Exists(path)) File.Replace(tmp, path, path + ".bak");
            else File.Move(tmp, path);
        }
    }
}
