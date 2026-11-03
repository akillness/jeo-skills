// Started by selfTestGuards(): proves that the guards reach worker threads.
import net from "node:net";
import { parentPort } from "node:worker_threads";

let code = "NOT_DENIED";
try {
  net.connect({ host: "192.0.2.1", port: 9 }).on("error", () => {});
} catch (error) {
  code = error.code ?? "ERROR";
}
parentPort.postMessage(code);
