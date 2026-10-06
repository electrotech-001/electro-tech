import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const path=(value:string)=>fileURLToPath(new URL(value,import.meta.url));
export default defineConfig({
 root:path("./"), publicDir:path("../../public"), plugins:[react()],
 resolve:{alias:{"@":path("../../"),"next/link":path("../next-link-mock.tsx"),"next/image":path("../next-image-mock.tsx")}},
 define:{"process.env.NODE_ENV":JSON.stringify("development"),"process.env.NEXT_PUBLIC_API_ORIGIN":JSON.stringify("http://localhost:3001"),"process.env.NEXT_PUBLIC_SITE_URL":JSON.stringify("http://localhost:5174")},
 server:{host:"127.0.0.1",port:5174},
});
