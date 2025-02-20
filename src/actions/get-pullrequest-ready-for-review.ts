import db from "src/db";
import logger from "src/utils/logger-handler";
import {EventsProcessed, EventsQuery,} from "src/interfaces/block-chain-service";
import {BountyPullRequestReadyForReviewEvent} from "@taikai/dappkit/dist/src/interfaces/events/network-v2-events";
import {DB_BOUNTY_NOT_FOUND, NETWORK_NOT_FOUND} from "../utils/messages.const";
import {DecodedLog} from "../interfaces/block-sniffer";
import {getBountyFromChain, getNetwork, parseLogWithContext} from "../utils/block-process";
import {sendMessageToTelegramChannels} from "../integrations/telegram";
import {BOUNTY_STATE_CHANGED} from "../integrations/telegram/messages";

export const name = "getBountyPullRequestReadyForReviewEvents";
export const schedule = "*/12 * * * *";
export const description = "Sync pull-request created events";
export const author = "clarkjoao";

export async function action(block: DecodedLog<BountyPullRequestReadyForReviewEvent['returnValues']>, query?: EventsQuery): Promise<EventsProcessed> {
  const eventsProcessed: EventsProcessed = {};

  const {returnValues: {bountyId, pullRequestId}, connection, address, chainId} = block;


  const bounty = await getBountyFromChain(connection, address, bountyId, name);
  if (!bounty)
    return eventsProcessed;

  const network = await getNetwork(chainId, address);
  if (!network) {
    logger.warn(NETWORK_NOT_FOUND(name, address))
    return eventsProcessed;
  }

  const dbBounty = await db.issues.findOne({
    where: {issueId: bounty.cid, contractId: bountyId, network_id: network.id},
    include: [{association: "network"}]
  })
  if (!dbBounty) {
    logger.warn(DB_BOUNTY_NOT_FOUND(name, bounty.cid, network.id));
    return eventsProcessed;
  }


  const pullRequest = bounty.pullRequests[pullRequestId];

  const dbPullRequest = await db.pull_requests.findOne({
    where: {issueId: dbBounty.id, githubId: pullRequest.cid.toString(), status: "draft", network_id: network?.id}
  })

  if (!dbPullRequest) {
    logger.warn(`${name} No pull request found with "draft" and id ${pullRequest.cid}, maybe it was already parsed?`);
    return eventsProcessed;
  }


  if (!["closed", "merged"].includes(dbPullRequest.status!.toString())) {
    dbPullRequest.status =
      pullRequest.canceled ? "canceled" : pullRequest?.ready ? "ready" : "draft";

    await dbPullRequest.save();
  }

  if (!["canceled", "closed", "proposal"].includes(dbBounty.state!)) {
    dbBounty.state = "ready";
    await dbBounty.save();
    sendMessageToTelegramChannels(BOUNTY_STATE_CHANGED(`ready`, dbBounty));
  }

  eventsProcessed[network.name!] = {
    [dbBounty.issueId!.toString()]: {bounty: dbBounty, eventBlock: parseLogWithContext(block)}
  };


  return eventsProcessed;
}
