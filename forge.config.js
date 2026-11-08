/* COORDIX Desktop · configuração do Electron Forge (empacotamento e instalador Windows). */
"use strict";
const path = require("path");
const { execFileSync } = require("child_process");
const pkg = require("./package.json");

// só o que o aplicativo usa entra no pacote; testes, documentação e ferramentas ficam de fora
const IGNORAR = [
  /^\/\.git(\/|$)/, /^\/\.github(\/|$)/, /^\/testes(\/|$)/, /^\/docs(\/|$)/, /^\/ferramentas(\/|$)/,
  /^\/out(\/|$)/, /^\/desktop\/scripts(\/|$)/, /^\/desktop-fumaca-.*\.json$/, /^\/README\.md$/,
  /^\/forge\.config\.js$/, /^\/marca\/.*\.png$/, /^\/\.gitignore$/,
];

module.exports = {
  packagerConfig: {
    name: "COORDIX",
    executableName: "COORDIX",
    appBundleId: pkg.coordix.appId,
    appCopyright: `© ${new Date().getFullYear()} ${pkg.author}`,
    icon: path.join(__dirname, "desktop", "build", "icon"), // .ico no Windows
    asar: true,
    ignore: IGNORAR,
    win32metadata: { CompanyName: "BIMOFFICE", FileDescription: "COORDIX (beta)", ProductName: "COORDIX", InternalName: "COORDIX", OriginalFilename: "COORDIX.exe" },
  },
  hooks: {
    // copia three.js, web-ifc e fontes de node_modules para desktop/vendor antes de empacotar
    generateAssets: async () => { execFileSync(process.execPath, [path.join(__dirname, "desktop", "scripts", "preparar-vendor.js")], { stdio: "inherit" }); },
  },
  makers: [
    {
      // instalador .exe (Squirrel.Windows): instala por usuário, cria atalho no menu Iniciar e na área de
      // trabalho, e é removido normalmente em Configurações → Aplicativos
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "coordix",
        title: "COORDIX (beta)",
        authors: pkg.author,
        description: pkg.description,
        setupExe: `COORDIX-Setup-${pkg.version}-beta.exe`,
        setupIcon: path.join(__dirname, "desktop", "build", "icon.ico"),
        noMsi: true,
      },
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32"] }, // versão portátil (sem instalação)
  ],
};
