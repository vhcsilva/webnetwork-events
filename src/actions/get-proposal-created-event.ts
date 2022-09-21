import db from "src/db";
import logger from "src/utils/logger-handler";
import {EventsProcessed, EventsQuery,} from "src/interfaces/block-chain-service";
import {XEvents} from "@taikai/dappkit";
import {BountyProposalCreatedEvent} from "@taikai/dappkit/dist/src/interfaces/events/network-v2-events";
import {EventService} from "../services/event-service";
import {NETWORK_BOUNTY_NOT_FOUND} from "../utils/messages.const";
import {validateProposal} from "../modules/proposal-validate-state";

export const name = "getBountyProposalCreatedEvents";
export const schedule = "*/13 * * * *";
export const description = "Sync proposal created events";
export const author = "clarkjoao";

export async function action(
  query?: EventsQuery
): Promise<EventsProcessed> {
  const eventsProcessed: EventsProcessed = {};

  try {
    const service = new EventService(name, query);

    const processor = async (block: XEvents<BountyProposalCreatedEvent>, network) => {
      const {bountyId, prId, proposalId} = block.returnValues;

      const bounty = await service.chainService.networkService.network.getBounty(bountyId);
      if (!bounty)
        return logger.error(NETWORK_BOUNTY_NOT_FOUND(name, bountyId, network.networkAddress));

      const values = await validateProposal(bounty, prId, proposalId, network.id);
      if (!values?.proposal || !values?.dbBounty || !values?.dbPullRequest)
        return;

      const {proposal, dbBounty, dbUser, dbPullRequest} = values;

      const dbIssue = await db.issues.findOne({where: {issueId: bounty.cid}});
      if (!dbIssue)
        return logger.warn(`${name} Issue ${bounty.cid} not found`);

      const dbProposal = await db.merge_proposals.findOne({where: {scMergeId: proposal.id.toString(), issueId: dbIssue?.id}});
      if (dbProposal)
        return logger.warn(`${name} Proposal with id ${proposalId} was already parsed`);

      await db.merge_proposals.create({
        scMergeId: proposal.id.toString(),
        issueId: dbBounty.id,
        pullRequestId: dbPullRequest.id,
        githubLogin: dbUser?.githubLogin,
        creator: proposal.creator
      });

      if (dbBounty.state !== "proposal") {
        dbBounty.state = "proposal";
        await dbBounty.save();
      }

      eventsProcessed[network.name] = {...eventsProcessed[network.name], [dbBounty.issueId!.toString()]: {bounty: dbBounty, eventBlock: block}};

    }

    await service.processEvents(processor);

  } catch (err) {
    logger.error(`${name} Error`, err);
  }
  return eventsProcessed;
}
