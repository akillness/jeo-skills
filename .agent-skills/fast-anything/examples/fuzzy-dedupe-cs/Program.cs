// Find near-duplicate customer names, the slow way.
//     dotnet run -c Release

string[] first = ["Maria", "Giulia", "Sofia", "Luca", "Marco", "Matteo", "José", "Zoë", "Łukasz", "Aiko",
    "Chen", "Olga", "Ahmed", "Fatima", "Liam", "Emma", "Noah", "Ava", "Mateo", "Ingrid"];
string[] last = ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "García", "Müller", "Nowak", "Tanaka",
    "Wang", "Ivanova", "Haddad", "Smith", "Johnson", "Brown", "Silva", "Kowalski", "Novák", "Dubois", "Larsen"];

var rng = new Random(7);
var names = new string[4000];
for (int k = 0; k < names.Length; k++)
{
    string name = first[rng.Next(first.Length)] + " " + last[rng.Next(last.Length)];
    if (rng.NextDouble() < 0.35)
    {
        int i = rng.Next(name.Length);
        name = name[..i] + "aeiourstln"[rng.Next(10)] + name[(i + 1)..];
    }
    names[k] = name;
}

int[][] pairs = Fuzzy.FindDuplicates(names, 2);
Console.WriteLine($"{names.Length} names, {pairs.Length} likely duplicate pairs");
int shown = 0;
foreach (var p in pairs)
{
    if (shown == 5) break;
    if (names[p[0]] != names[p[1]])
    {
        Console.WriteLine($"  {names[p[0]]} ~ {names[p[1]]}");
        shown++;
    }
}
