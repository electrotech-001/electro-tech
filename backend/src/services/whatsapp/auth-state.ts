import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import type { WhatsAppAuthRepository } from "./repository.js";

export type LoadedAuthState = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
};

function thaw(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

function freeze(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

export async function loadAuthState(repository: WhatsAppAuthRepository): Promise<LoadedAuthState> {
  async function readData(key: string): Promise<unknown | null> {
    const stored = await repository.read(key);
    if (stored == null) return null;
    return thaw(stored);
  }

  async function writeData(key: string, value: unknown): Promise<void> {
    await repository.write(key, freeze(value));
  }

  const creds = ((await readData("creds")) as AuthenticationCreds | null) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value) data[id] = value as SignalDataTypeMap[typeof type];
            }),
          );
          return data;
        },
        set: async (patch) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(patch) as Array<keyof SignalDataTypeMap>) {
            const entries = patch[category];
            if (!entries) continue;
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              const key = `${category}-${id}`;
              if (value) tasks.push(writeData(key, value));
              else if (value === null) tasks.push(repository.remove(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
  };
}
