import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';
import { logError } from './logger.js';

export async function useFileAuthState(folder) {
  const writeData = async (data, file) => {
    try {
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(
        path.join(folder, file),
        JSON.stringify(data, BufferJSON.replacer, 2)
      );
    } catch (e) {
      logError('Store', `Write error ${file}`, e);
    }
  };

  const readData = async (file) => {
    try {
      const data = await fs.readFile(path.join(folder, file), 'utf-8');
      return JSON.parse(data, BufferJSON.reviver);
    } catch (e) {
      return null;
    }
  };

  const removeData = async (file) => {
    try {
      await fs.unlink(path.join(folder, file));
    } catch (e) {}
  };

  const creds = (await readData('creds.json')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData(creds, 'creds.json');
    }
  };
}

export async function removeSessionFolder(folder) {
  try {
    await fs.rm(folder, { recursive: true, force: true });
  } catch (e) {}
}
