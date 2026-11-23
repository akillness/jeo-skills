// Tiny Todo: a demo app for agent testers. It contains DELIBERATE bugs
// (listed in BUGS.md) so you can check how many the agents find.
// Do not fix them here: they are the benchmark.
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

const SEED = ['Buy apples', 'Call the plumber', 'Pay the rent', 'Book the dentist'];

function SignUp({ onDone, dark }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    // BUG 1: rejects "+", capitals and sub-domains (name+tag@mail.example.com)
    if (!/^[a-z0-9.]+@[a-z0-9]+\.[a-z]+$/.test(email)) {
      setError('Something went wrong'); // BUG 2: says nothing useful
      return;
    }
    // BUG 3: the 8-character rule is only revealed after a failure, with the same vague message
    if (password.length < 8) {
      setError('Something went wrong');
      return;
    }
    onDone(name.trim() || 'friend');
  };

  return (
    // BUG 4: no KeyboardAvoidingView: on small iPhones the keyboard hides "Continue"
    <View style={[styles.screen, dark && styles.screenDark]}>
      <Text style={styles.title}>Create your account</Text>
      <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail}
        autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.continue} onPress={submit} accessibilityRole="button">
        <Text style={styles.continueText}>Continue</Text>
      </Pressable>
    </View>
  );
}

function Home({ name, dark }) {
  const [tasks, setTasks] = useState(SEED.map((title, i) => ({ id: String(i), title })));
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');

  // BUG 5: case-sensitive search ("Apples" finds nothing)
  const shown = tasks.filter((t) => t.title.includes(query));
  const add = () => {
    // BUG 6: empty tasks are accepted
    setTasks([...tasks, { id: String(Date.now()), title: draft }]);
    setDraft('');
  };

  return (
    <View style={[styles.screen, dark && styles.screenDark]}>
      {/* BUG 7: fixed-height header, cut with large text sizes */}
      <View style={styles.header}>
        <Text style={styles.title}>Hi {name}, here are your tasks for today and tomorrow</Text>
      </View>
      {/* BUG 8: "1 tasks" */}
      <Text style={styles.count}>{shown.length} tasks</Text>
      <TextInput style={styles.input} placeholder="Search" value={query} onChangeText={setQuery} />
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="New task" value={draft} onChangeText={setDraft} />
        <Pressable style={styles.add} onPress={add} accessibilityRole="button">
          <Text style={styles.continueText}>Add</Text>
        </Pressable>
      </View>
      {/* BUG 9: no empty state when the list or the search is empty */}
      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <View style={styles.task}>
            {/* BUG 10: hard-coded dark text, unreadable in dark mode */}
            <Text style={styles.taskText}>{item.title}</Text>
            {/* BUG 11: 12-pt delete target, no confirmation, no undo */}
            <Text style={styles.delete} onPress={() => setTasks(tasks.filter((t) => t.id !== item.id))}>x</Text>
          </View>
        )}
      />
    </View>
  );
}

export default function App() {
  const dark = useColorScheme() === 'dark';
  const [name, setName] = useState(null);
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {name ? <Home name={name} dark={dark} /> : <SignUp onDone={setName} dark={dark} />}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fafaf7', paddingTop: 64, paddingHorizontal: 20 },
  screenDark: { backgroundColor: '#111' },
  title: { fontSize: 24, fontWeight: '600', color: '#888', marginBottom: 16 },
  header: { height: 64, overflow: 'hidden' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16, color: '#888' },
  error: { color: '#c0392b', marginBottom: 12 },
  continue: { position: 'absolute', left: 20, right: 20, bottom: 40, backgroundColor: '#2f6f4f', borderRadius: 12, padding: 16, alignItems: 'center' },
  continueText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  count: { color: '#888', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  add: { backgroundColor: '#2f6f4f', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', marginBottom: 12 },
  task: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  taskText: { flex: 1, fontSize: 17, color: '#222' },
  delete: { fontSize: 12, color: '#999', paddingHorizontal: 2 },
});
