import { credentials } from 'grpc'
import { AdmissionControlClient } from './__generated__/admission_control_grpc_pb'
import { UpdateToLatestLedgerRequest, ResponseItem, GetAccountStateResponse, RequestItem, GetAccountStateRequest } from './__generated__/get_with_proof_pb';
import { AccountStateWithProof, AccountStateBlob } from './__generated__/account_state_blob_pb';
import { CursorBuffer } from './common/CursorBuffer';
import { AccountResource, AccountResources } from './wallet/accounts';
import PathValues from './constants/PathValues';

export enum Network {
  Testnet = 'testnet',
  Mainnet = 'mainnet'
}

interface LibralLibConfig {
  port: string,
  host: string,
  faucetAccountFile?: string,
  faucetServerHost?: string,
  mnemonicFilePath?: string,
  validatorSetFile?: string,
  network?: Network,
}

export class LiberaClient {
  private _config: LibralLibConfig;
  private _client: AdmissionControlClient;

  constructor(config: LibralLibConfig) {
    this._config = config;

    const connectionAddress = `${config.host}:${config.port}`;
    this._client = new AdmissionControlClient(connectionAddress, credentials.createInsecure());
  }

  /**
   * Fetches the current state of an account.
   * 
   * @param {string[]} addresses Array of users addresses
   */
  public async getAccountState(addresses: string[]): Promise<AccountResources> {
    // TODO: Validate address lengths before making request
    const request = new UpdateToLatestLedgerRequest();

    addresses.forEach(address => {
      const requestItem = new RequestItem();
      const getAccountStateRequest = new GetAccountStateRequest();
      getAccountStateRequest.setAddress(Uint8Array.from(Buffer.from(address, 'hex')));
      requestItem.setGetAccountStateRequest(getAccountStateRequest)
      request.addRequestedItems(requestItem);
    })

    return new Promise<AccountResources>((resolve, reject) => {
      this._client.updateToLatestLedger(request, (error, response) => {
        if (error) {
          return reject(error);
        }

        resolve(response.getResponseItemsList().map((item: ResponseItem) => {
          const stateResponse = item.getGetAccountStateResponse() as GetAccountStateResponse;
          const stateWithProof = stateResponse.getAccountStateWithProof() as AccountStateWithProof;
          const stateBlob = stateWithProof.getBlob() as AccountStateBlob;
          const blob = stateBlob.getBlob_asU8();
          const accountState = this._decodeAccountStateBlob(blob);
          return accountState;
        }))
      })
    });
  }

  private _decodeAccountStateBlob(blob: Uint8Array): AccountResource {
    const cursor = new CursorBuffer(blob);
    const blobLen = cursor.read32();

    const state: { [key: string]: Uint8Array } = {};

    for (let i = 0; i < blobLen; i++) {
      const keyLen = cursor.read32();
      const keyBuffer = new Uint8Array(keyLen);
      for (let j = 0; j < keyLen; j++) {
        keyBuffer[j] = cursor.read8();
      }

      const valueLen = cursor.read32();
      const valueBuffer = new Uint8Array(valueLen);
      for (let k = 0; k < valueLen; k++) {
        valueBuffer[k] = cursor.read8();
      }

      state[Buffer.from(keyBuffer).toString('hex')] = valueBuffer;
    }

    return AccountResource.from(state[PathValues.AccountStatePath]);
  }

}

export default LiberaClient