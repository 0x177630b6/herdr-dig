// Herdr Fleet's notifier: posts one notification from its environment, then quits.
ObjC.import("Foundation");
function run() {
  const env = $.NSProcessInfo.processInfo.environment;
  const get = (k) => { const v = env.objectForKey(k); return v.isNil() ? "" : ObjC.unwrap(v); };
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.displayNotification(get("FLEET_BODY"), { withTitle: get("FLEET_TITLE"), subtitle: get("FLEET_SUB") });
}
