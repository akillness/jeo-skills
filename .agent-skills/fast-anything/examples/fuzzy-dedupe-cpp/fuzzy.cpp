// Fuzzy string matching helpers.
#include <algorithm>
#include <cctype>
#include <string>
#include <utility>
#include <vector>

// Edit distance (by byte): how many inserts, deletes or substitutions turn a into b.
static int levenshtein(const std::string &a, const std::string &b) {
    const std::string &s = a.size() >= b.size() ? a : b;
    const std::string &t = a.size() >= b.size() ? b : a;
    std::vector<int> previous(t.size() + 1), current(t.size() + 1);
    for (size_t j = 0; j <= t.size(); j++) previous[j] = (int) j;
    for (size_t i = 1; i <= s.size(); i++) {
        current[0] = (int) i;
        for (size_t j = 1; j <= t.size(); j++) {
            int cost = s[i - 1] == t[j - 1] ? 0 : 1;
            current[j] = std::min({previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost});
        }
        std::swap(previous, current);
    }
    return previous[t.size()];
}

// Lowercase (ASCII) and squeeze whitespace.
static std::string normalize(const std::string &name) {
    std::string out;
    bool space = false;
    for (unsigned char c : name) {
        if (std::isspace(c)) {
            space = !out.empty();
            continue;
        }
        if (space) out += ' ';
        space = false;
        out += (char) std::tolower(c);
    }
    return out;
}

// Index pairs of names within max_distance edits of each other.
std::vector<std::pair<int, int>> find_duplicates(const std::vector<std::string> &names, int max_distance) {
    std::vector<std::string> clean;
    for (const auto &n : names) clean.push_back(normalize(n));
    std::vector<std::pair<int, int>> pairs;
    for (size_t i = 0; i < clean.size(); i++) {
        for (size_t j = i + 1; j < clean.size(); j++) {
            if (levenshtein(clean[i], clean[j]) <= max_distance) pairs.emplace_back((int) i, (int) j);
        }
    }
    return pairs;
}
