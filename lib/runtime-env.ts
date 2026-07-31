import { mysqlD1Database } from "@/db/mysql-d1";
import { garageBucket } from "@/lib/garage-storage";

export const runtimeEnv = new Proxy(process.env as Record<string, unknown>, {
  get(target, property, receiver) {
    if (property === "DB") return mysqlD1Database();
    if (property === "MEDIA") return garageBucket();
    return Reflect.get(target, property, receiver);
  },
  ownKeys(target) {
    return [...new Set([...Reflect.ownKeys(target), "DB", "MEDIA"])];
  },
  getOwnPropertyDescriptor(target, property) {
    if (property === "DB" || property === "MEDIA") {
      return { enumerable: true, configurable: true };
    }
    return Reflect.getOwnPropertyDescriptor(target, property);
  },
});
