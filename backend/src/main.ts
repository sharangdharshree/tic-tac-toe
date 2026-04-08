/// <reference path="./auth.ts" />

const InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);
  logger.info("Tic-tac-toe server initialized");
};
