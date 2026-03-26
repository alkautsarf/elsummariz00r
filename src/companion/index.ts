import { loadEnv } from "../env";
import { startServer } from "./server";

await loadEnv();
startServer();
