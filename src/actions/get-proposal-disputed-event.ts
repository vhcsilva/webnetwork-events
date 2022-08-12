import db from "src/db";
import {
  BountiesProcessed,
  BountiesProcessedPerNetwork,
  EventsQuery,
} from "src/interfaces/block-chain-service";
import validateProposalState from "src/modules/proposal-validate-state";
import BlockChainService from "src/services/block-chain-service";
import logger from "src/utils/logger-handler";

export const name = "getBountyProposalDisputedEvents";
export const schedule = "1 * * * * *";
export const description = "";
export const author = "clarkjoao";

export default async function action(
  query?: EventsQuery
): Promise<BountiesProcessedPerNetwork[]> {
  const bountiesProcessedPerNetwork: BountiesProcessedPerNetwork[] = [];

  logger.info("retrieving bounty created events");

  const service = new BlockChainService();
  await service.init(name);

  const events = await service.getEvents(query);

  logger.info(`found ${events.length} events`);

  try {
    for (let event of events) {
      const { network, eventsOnBlock } = event;

      const bountiesProcessed: BountiesProcessed[] = [];

      if (!(await service.networkService.loadNetwork(network.networkAddress))) {
        logger.error(`Error loading network contract ${network.name}`);
        continue;
      }

      for (let eventBlock of eventsOnBlock) {
        const { bountyId: id, prId, proposalId } = eventBlock.returnValues;
        const networkBounty = await service.networkService?.network?.getBounty(
          id
        );

        if (!networkBounty) {
          logger.info(`Bounty id: ${id} not found`);
          continue;
        }

        const bounty = await db.issues.findOne({
          where: {
            contractId: +networkBounty.id,
            issueId: networkBounty.cid,
            creatorAddress: networkBounty.creator,
            network_id: network.id,
          },
        });

        if (!bounty) {
          logger.info(`Bounty cid: ${id} not found`);
          continue;
        }

        const networkPullRequest = networkBounty.pullRequests.find(
          (pr) => +pr.id === +prId
        );

        if (!networkPullRequest) {
          logger.info(`Pull request id: ${prId} not found`);
          continue;
        }

        const pullRequest = await db.pull_requests.findOne({
          where: {
            issueId: bounty.id,
            contractId: +networkPullRequest?.id,
            githubId: networkPullRequest?.cid.toString(),
          },
        });

        if (!pullRequest) {
          logger.info(`Pull request cid: ${networkPullRequest.cid} not found`);
          continue;
        }

        const networkProposal = networkBounty.proposals.find(
          (pr) => +pr.id === +proposalId
        );

        if (!networkProposal) {
          logger.info(`Proposal id: ${proposalId} not found`);
          continue;
        }

        const proposal = await db.merge_proposals.findOne({
          where: {
            pullRequestId: pullRequest?.id,
            issueId: bounty?.id,
            contractId: +networkProposal.id,
          },
        });

        if (!proposal) {
          logger.info(`Proposal cid: ${proposalId} not found`);
          continue;
        }
        bounty.state = await validateProposalState(
          bounty.state as string,
          networkBounty,
          service.networkService
        );

        await bounty.save();

        bountiesProcessed.push({ bounty, eventBlock });

        logger.info(`Bounty cid: ${id} created`);
      }

      bountiesProcessedPerNetwork.push({ network, bountiesProcessed });
    }
    if (!query) await service.saveLastBlock();
  } catch (err) {
    logger.error(`Error ${name}:`, err);
  }
  return bountiesProcessedPerNetwork;
}
