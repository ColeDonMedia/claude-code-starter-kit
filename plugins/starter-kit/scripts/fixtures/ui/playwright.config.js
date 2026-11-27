export default {
  testDir: ".",
  testMatch: "ui.spec.js",
  reporter: "line",
  workers: 1,
  projects: [
    { name: "phone", use: { viewport: { width: 375, height: 812 }, isMobile: false } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
};
