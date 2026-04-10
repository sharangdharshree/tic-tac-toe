/// <reference path="./types.ts" />
/// <reference path="./auth.ts" />
/// <reference path="./match.ts" />
/// <reference path="./matchmaker.ts" />

const InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);

  initializer.registerMatch(MODULE_NAME, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
    matchSignal,
  });

  initializer.registerMatchmakerMatched(matchmakerMatched);

  logger.info("Tic-tac-toe server initialized");
};
