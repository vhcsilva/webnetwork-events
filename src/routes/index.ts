import {Router} from "express";

import {eventsRouter} from "./events.routes";
import {seoRoutes} from "./seo.routes";
import readRouter from "./read.router";
import {getChainsRegistryAndNetworks} from "../utils/block-process";

const router = Router();

router.use("/seo", seoRoutes);

router.use("/past-events", eventsRouter);

router.use(`/read/`, readRouter);

router.use("/", async (req, res) => {
  const info = await getChainsRegistryAndNetworks();
  return res.status(200).json({info, chainId: process.env.EVENTS_CHAIN_ID || `all`});
});

export {router};
