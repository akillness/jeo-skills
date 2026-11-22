// Find near-duplicate customer names, the slow way.
//     clang++ -O2 -std=c++17 main.cpp fuzzy.cpp -o dedupe
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

std::vector<std::pair<int, int>> find_duplicates(const std::vector<std::string> &names, int max_distance);

static const char *FIRST[] = {"Maria", "Giulia", "Sofia", "Luca", "Marco", "Matteo", "José", "Zoë", "Łukasz", "Aiko",
                              "Chen", "Olga", "Ahmed", "Fatima", "Liam", "Emma", "Noah", "Ava", "Mateo", "Ingrid"};
static const char *LAST[] = {"Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "García", "Müller", "Nowak", "Tanaka", "Wang",
                             "Ivanova", "Haddad", "Smith", "Johnson", "Brown", "Silva", "Kowalski", "Novák", "Dubois", "Larsen"};

int main() {
    unsigned long long seed = 7;
    auto next = [&](unsigned n) {
        seed = seed * 6364136223846793005ULL + 1442695040888963407ULL;
        return (unsigned) ((seed >> 33) % n);
    };
    std::vector<std::string> names;
    for (int k = 0; k < 6000; k++) {
        std::string name = std::string(FIRST[next(20)]) + " " + LAST[next(20)];
        if (next(100) < 35) {
            size_t at = next((unsigned) name.size());
            if ((unsigned char) name[at] < 0x80) name[at] = "aeiourstln"[next(10)]; // keep it valid UTF-8
        }
        names.push_back(name);
    }
    auto pairs = find_duplicates(names, 2);
    std::printf("%zu names, %zu likely duplicate pairs\n", names.size(), pairs.size());
    return 0;
}
