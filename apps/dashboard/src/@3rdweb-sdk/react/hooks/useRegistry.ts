import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addContractToMultiChainRegistry } from "components/contract-components/utils";
import { MULTICHAIN_REGISTRY_CONTRACT } from "constants/contracts";
import {
  DASHBOARD_ENGINE_RELAYER_URL,
  DASHBOARD_FORWARDER_ADDRESS,
} from "constants/misc";
import type { BasicContract } from "contract-ui/types/types";
import { getAllMultichainRegistry } from "dashboard-extensions/common/read/getAllMultichainRegistry";
import { useAllChainsData } from "hooks/chains/allChains";
import { useMemo } from "react";
import { sendAndConfirmTransaction } from "thirdweb";
import { remove } from "thirdweb/extensions/thirdweb";
import { useActiveAccount } from "thirdweb/react";
import invariant from "tiny-invariant";

export function useMultiChainRegContractList(walletAddress?: string) {
  return useQuery({
    queryKey: ["dashboard-registry", walletAddress, "multichain-contract-list"],
    queryFn: async () => {
      invariant(walletAddress, "walletAddress is required");
      const contracts = await getAllMultichainRegistry({
        contract: MULTICHAIN_REGISTRY_CONTRACT,
        address: walletAddress,
      });

      return contracts;
    },

    enabled: !!walletAddress,
  });
}

interface Options {
  onlyMainnet?: boolean;
}

export const useAllContractList = (
  walletAddress: string | undefined,
  { onlyMainnet }: Options = { onlyMainnet: false },
) => {
  const multiChainQuery = useMultiChainRegContractList(walletAddress);

  // TODO - instead of using ALL chains, fetch only the ones used here
  const { idToChain } = useAllChainsData();
  const contractList = useMemo(() => {
    const data = multiChainQuery.data || [];

    const mainnets: BasicContract[] = [];
    const testnets: BasicContract[] = [];

    // biome-ignore lint/complexity/noForEach: FIXME
    data.forEach((net) => {
      const chn = idToChain.get(net.chainId);
      if (chn && chn.status !== "deprecated") {
        if (chn.testnet) {
          testnets.push(net);
        } else {
          mainnets.push(net);
        }
      }
    });

    mainnets.sort((a, b) => a.chainId - b.chainId);

    if (onlyMainnet) {
      return mainnets;
    }

    testnets.sort((a, b) => a.chainId - b.chainId);
    return mainnets.concat(testnets);
  }, [multiChainQuery.data, onlyMainnet, idToChain]);

  return {
    ...multiChainQuery,
    data: contractList,
  };
};

type RemoveContractParams = {
  contractAddress: string;
  chainId: number;
};

export function useRemoveContractMutation() {
  const queryClient = useQueryClient();
  const account = useActiveAccount();
  return useMutation({
    mutationFn: async (data: RemoveContractParams) => {
      invariant(data.chainId, "chainId not provided");
      invariant(account, "No wallet connected");
      const { contractAddress, chainId } = data;
      const transaction = remove({
        contract: MULTICHAIN_REGISTRY_CONTRACT,
        deployer: account.address,
        deployment: contractAddress,
        chainId: BigInt(chainId),
      });
      return await sendAndConfirmTransaction({
        transaction,
        account,
        gasless: {
          experimentalChainlessSupport: true,
          provider: "engine",
          relayerUrl: DASHBOARD_ENGINE_RELAYER_URL,
          relayerForwarderAddress: DASHBOARD_FORWARDER_ADDRESS,
        },
      });
    },

    onSettled: () => {
      return queryClient.invalidateQueries({
        queryKey: ["dashboard-registry"],
      });
    },
  });
}

type AddContractParams = {
  contractAddress: string;
  chainId: number;
};

export function useAddContractMutation() {
  const account = useActiveAccount();

  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AddContractParams) => {
      invariant(account, "cannot add a contract without an address");

      return await addContractToMultiChainRegistry(
        {
          address: data.contractAddress,
          chainId: data.chainId,
        },
        account,
        300000n,
      );
    },

    onSettled: () => {
      return queryClient.invalidateQueries({
        queryKey: ["dashboard-registry"],
      });
    },
  });
}
