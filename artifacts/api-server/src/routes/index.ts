import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import friendsRouter from "./friends";
import conversationsRouter from "./conversations";
import partiesRouter from "./parties";
import gamesRouter from "./games";
import platformsRouter from "./platforms";
import notificationsRouter from "./notifications";
import iceRouter from "./ice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(friendsRouter);
router.use(conversationsRouter);
router.use(partiesRouter);
router.use(gamesRouter);
router.use(platformsRouter);
router.use(notificationsRouter);
router.use(iceRouter);

export default router;
