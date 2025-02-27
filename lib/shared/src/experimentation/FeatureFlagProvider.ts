import { graphqlClient, type SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { wrapInActiveSpan } from '../tracing'
import { isError } from '../utils'

export enum FeatureFlag {
    // This flag is only used for testing the behavior of the provider and should not be used in
    // product code
    TestFlagDoNotUse = 'test-flag-do-not-use',

    // Enable both-client side and server-side tracing
    CodyAutocompleteTracing = 'cody-autocomplete-tracing',
    // This flag is used to track the overall eligibility to use the StarCoder model. The `-hybrid`
    // suffix is no longer relevant
    CodyAutocompleteStarCoderHybrid = 'cody-autocomplete-default-starcoder-hybrid',
    // Force all StarCoder traffic (controlled by the above flag) to point to the 16b model.
    CodyAutocompleteStarCoder16B = 'cody-autocomplete-default-starcoder-16b',
    // Enable Llama Code 13b as the default model via Fireworks
    CodyAutocompleteLlamaCode13B = 'cody-autocomplete-llama-code-13b',
    // Enables the bfg-mixed context retriever that will combine BFG with the default local editor
    // context.
    CodyAutocompleteContextBfgMixed = 'cody-autocomplete-context-bfg-mixed',
    // Enables the new-jaccard-similarity context strategy that can find more than one match per
    // open file and includes matches from the same file.
    CodyAutocompleteContextNewJaccardSimilarity = 'cody-autocomplete-new-jaccard-similarity',
    // Enable latency adjustments based on accept/reject streaks
    CodyAutocompleteUserLatency = 'cody-autocomplete-user-latency',
    // Dynamically decide wether to show a single line or multiple lines for completions.
    CodyAutocompleteDynamicMultilineCompletions = 'cody-autocomplete-dynamic-multiline-completions',
    // Completion requests will be cancelled as soon as a new request comes in and the debounce time
    // will be reduced to try and counter the latency impact.
    CodyAutocompleteEagerCancellation = 'cody-autocomplete-eager-cancellation',
    // Continue generations after a single-line completion and use the response to see the next line
    // if the first completion is accepted.
    CodyAutocompleteHotStreak = 'cody-autocomplete-hot-streak',
    // Connects to Cody Gateway directly and skips the Sourcegraph instance hop for completions
    CodyAutocompleteFastPath = 'cody-autocomplete-fast-path',
    // Trigger only one request for every multiline completion instead of three.
    CodyAutocompleteSingleMultilineRequest = 'cody-autocomplete-single-multiline-request',

    // Enable Cody PLG features on JetBrains
    CodyProJetBrains = 'cody-pro-jetbrains',

    // use-ssc-for-cody-subscription is a feature flag that enables the use of SSC as the source of truth for Cody subscription data.
    UseSscForCodySubscription = 'use-ssc-for-cody-subscription',

    // cody-pro-trial-ended is a feature flag that indicates if the Cody Pro "Free Trial"  has ended.
    // (Enabling users to use Cody Pro for free for 3-months starting in late Q4'2023.)
    CodyProTrialEnded = 'cody-pro-trial-ended',

    // A feature flag to test potential chat experiments. No functionality is gated by it.
    CodyChatMockTest = 'cody-chat-mock-test',

    // Show command hints alongside editor selections. "Opt+K to Edit, Opt+L to Chat"
    CodyCommandHints = 'cody-command-hints',
}

const ONE_HOUR = 60 * 60 * 1000

export class FeatureFlagProvider {
    // The first key maps to the endpoint so that we do never cache the wrong flag for different
    // endpoints
    private featureFlags: Record<string, Record<string, boolean>> = {}
    private lastUpdated = 0

    constructor(private apiClient: SourcegraphGraphQLAPIClient) {}

    public getFromCache(
        flagName: FeatureFlag,
        endpoint: string = this.apiClient.endpoint
    ): boolean | undefined {
        const now = Date.now()
        if (now - this.lastUpdated > ONE_HOUR) {
            // Cache expired, refresh
            void this.refreshFeatureFlags()
        }

        return this.featureFlags[endpoint]?.[flagName]
    }

    public getExposedExperiments(endpoint: string = this.apiClient.endpoint): Record<string, boolean> {
        return this.featureFlags[endpoint] || {}
    }

    public async evaluateFeatureFlag(flagName: FeatureFlag): Promise<boolean> {
        return wrapInActiveSpan(`FeatureFlagProvider.evaluateFeatureFlag.${flagName}`, async () => {
            const endpoint = this.apiClient.endpoint
            if (process.env.BENCHMARK_DISABLE_FEATURE_FLAGS) {
                return false
            }

            const cachedValue = this.getFromCache(flagName, endpoint)
            if (cachedValue !== undefined) {
                return cachedValue
            }

            const value = await this.apiClient.evaluateFeatureFlag(flagName)
            if (!this.featureFlags[endpoint]) {
                this.featureFlags[endpoint] = {}
            }
            this.featureFlags[endpoint][flagName] = value === null || isError(value) ? false : value
            return this.featureFlags[endpoint][flagName]
        })
    }

    public async syncAuthStatus(): Promise<void> {
        this.featureFlags = {}
        await this.refreshFeatureFlags()
    }

    private async refreshFeatureFlags(): Promise<void> {
        return wrapInActiveSpan('FeatureFlagProvider.refreshFeatureFlags', async () => {
            const endpoint = this.apiClient.endpoint
            const data = await this.apiClient.getEvaluatedFeatureFlags()
            this.featureFlags[endpoint] = isError(data) ? {} : data
            this.lastUpdated = Date.now()
        })
    }
}

export const featureFlagProvider = new FeatureFlagProvider(graphqlClient)
