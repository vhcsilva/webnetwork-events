import db from "src/db";
import logger from "src/utils/logger-handler";
import {EventsProcessed, EventsQuery,} from "src/interfaces/block-chain-service";
import {NetworkCreatedEvent} from "@taikai/dappkit/dist/src/interfaces/events/network-factory-v2-events";
import {updateNumberOfNetworkHeader} from "src/modules/handle-header-information";
import {findOrCreateToken} from "src/modules/tokens";
import {DecodedLog} from "../interfaces/block-sniffer";
import {Network_v2} from "@taikai/dappkit";

export const name = "getNetworkRegisteredEvents";
export const schedule = "*/10 * * * *";
export const description = "retrieving network registered on registry events";
export const author = "vhcsilva";

export async function action(block: DecodedLog<NetworkCreatedEvent['returnValues']>, query?: EventsQuery): Promise<EventsProcessed> {
  const eventsProcessed: EventsProcessed = {};
  const {returnValues: {network: createdNetworkAddress}, connection, chainId} = block;

  const network = await db.networks.findOne({where: {networkAddress: createdNetworkAddress, chain_id: chainId}});

  if (!network) {
    logger.warn(`${name} network with address ${createdNetworkAddress} not found on db`);
    return eventsProcessed
  }

  if (network.isRegistered) {
    logger.warn(`${name} ${createdNetworkAddress} was already registered`);
    return eventsProcessed
  }

  const _network = new Network_v2(connection, createdNetworkAddress);
  await _network.start();
  await _network.loadContract();

  if (_network.networkToken?.contractAddress) {
    const address = _network.networkToken.contractAddress!;
    const name = await _network.networkToken.name();
    const symbol = await _network.networkToken.symbol();

    const networkToken = await findOrCreateToken(address, name, symbol);

    if (networkToken)
      network.network_token_id = networkToken.id;
  }

  network.isRegistered = true;

  await network.save();

  await updateNumberOfNetworkHeader();

  logger.warn(`${name} Registered ${createdNetworkAddress}`);
  eventsProcessed[network.name!] = [network.networkAddress!];

  return eventsProcessed;
}
