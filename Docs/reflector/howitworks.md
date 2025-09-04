[Getting started](https://reflector.network/docs) [How it works](https://reflector.network/docs/how-it-works) [Use public feed](https://reflector.network/docs/interface)

[Examples](https://reflector.network/docs/examples)

[Forced position liquidation](https://reflector.network/docs/examples/forced-liquidation) [Algorithmic stablecoin](https://reflector.network/docs/examples/algo-stablecoin) [Portfolio rebalancing](https://reflector.network/docs/examples/portfolio-rebalancing)

* * *

# / Use public feed

Integrate oracle in your code

Public Reflector price feeds are readily available for all Stellar smart contracts. Just add the contract interface to your codebase — and it's ready to go.

Our contracts implement [SEP-40](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0040.md) standard trait (so they are compatible with most Stellar ecosystem protocols), extending it with additional utility functions like cross-price calculation and TWAP approximation.

### / Invocation from consumer contract

Network:

[MAINNET](https://reflector.network/docs/interface#)

Oracle:

[External CEX & DEX](https://reflector.network/docs/interface#)

Utilize this example to invoke oracles from your contract code.

```
/* contract.rs */
use crate::reflector::{ReflectorClient, Asset as ReflectorAsset}; // Import Reflector interface
use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol};

#[contract]
pub struct MyAwesomeContract; // Of course, it's awesome, we know it!

#[contractimpl]
impl MyAwesomeContract {
    pub fn lets_rock(e: Env) {
        // Oracle contract address to use
        let oracle_address = Address::from_str(&e, "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN");
        // Create client for working with oracle
        let reflector_client = ReflectorClient::new(&e, &oracle_address);
        // Ticker to lookup the price
        let ticker = ReflectorAsset::Other(Symbol::new(&e, &("BTC")));
        // Fetch the most recent price record for it
        let recent = reflector_client.lastprice(&ticker);
        // Check the result
        if recent.is_none() {
            //panic_with_error!(&e, "price not available");
        }
        // Retrieve the price itself
        let price = recent.unwrap().price;

        // Do not forget for price precision, get decimals from the oracle
        // (this value can be also hardcoded once the price feed has been
        // selected because decimals never change in live oracles)
        let price_decimals = reflector_client.decimals();

        // Let's check how much of quoted asset we can potentially purchase for $10
        let usd_balance = 10_0000000i128; // $10 with standard Stellar token precision
        let can_purchase = (usd_balance * 10i128.pow(price_decimals)) / price;

        // How many USD we'll need to buy 5 quoted asset tokens?
        let want_purchase = 5_0000000i128; // 5 tokens with standard Stellar token precision
        let need_usd = (want_purchase * price) / 10i128.pow(price_decimals);

        // Please note: check for potential overflows or use safe math when dealing with prices
    }
}
```

### / Interface for Reflector public price feed

[Copy to clipboard](https://reflector.network/docs/interface# "Copy to clipboard") Copy and save it in your smart contract project as "reflector.rs" file. This is the oracle client.

```
/* reflector.rs */
use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};

// Oracle contract interface exported as ReflectorClient
#[soroban_sdk::contractclient(name = "ReflectorClient")]
pub trait Contract {
    // Base oracle symbol the price is reported in
    fn base(e: Env) -> Asset;
    // All assets quoted by the contract
    fn assets(e: Env) -> Vec<Asset>;
    // Number of decimal places used to represent price for all assets quoted by the oracle
    fn decimals(e: Env) -> u32;
    // Quotes asset price in base asset at specific timestamp
    fn price(e: Env, asset: Asset, timestamp: u64) -> Option<PriceData>;
    // Quotes the most recent price for an asset
    fn lastprice(e: Env, asset: Asset) -> Option<PriceData>;
    // Quotes last N price records for the given asset
    fn prices(e: Env, asset: Asset, records: u32) -> Option<Vec<PriceData>>;
    // Quotes the most recent cross price record for the pair of assets
    fn x_last_price(e: Env, base_asset: Asset, quote_asset: Asset) -> Option<PriceData>;
    // Quotes the cross price for the pair of assets at specific timestamp
    fn x_price(e: Env, base_asset: Asset, quote_asset: Asset, timestamp: u64) -> Option<PriceData>;
    // Quotes last N cross price records of for the pair of assets
    fn x_prices(e: Env, base_asset: Asset, quote_asset: Asset, records: u32) -> Option<Vec<PriceData>>;
    // Quotes the time-weighted average price for the given asset over N recent records
    fn twap(e: Env, asset: Asset, records: u32) -> Option<i128>;
    // Quotes the time-weighted average cross price for the given asset pair over N recent records
    fn x_twap(e: Env, base_asset: Asset, quote_asset: Asset, records: u32) -> Option<i128>;
    // Price feed resolution (default tick period timeframe, in seconds - 5 minutes by default)
    fn resolution(e: Env) -> u32;
    // Historical records retention period, in seconds (24 hours by default)
    fn period(e: Env) -> Option<u64>;
    // The most recent price update timestamp
    fn last_timestamp(e: Env) -> u64;
    // Contract protocol version
    fn version(e: Env) -> u32;
    // Contract admin address
    fn admin(e: Env) -> Option<Address>;
    // Note: it's safe to remove any methods not used by the consumer contract from this client trait
}

// Quoted asset definition
#[contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum Asset {
    Stellar(Address), // for Stellar Classic and Soroban assets
    Other(Symbol)     // for any external currencies/tokens/assets/symbols
}

// Price record definition
#[contracttype(export = false)]
#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct PriceData {
    pub price: i128,   // asset price at given point in time
    pub timestamp: u64 // record timestamp
}

// Possible runtime errors
#[soroban_sdk::contracterror(export = false)]
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub enum Error {
    AlreadyInitialized = 0,
    Unauthorized = 1,
    AssetMissing = 2,
    AssetAlreadyExists = 3,
    InvalidConfigVersion = 4,
    InvalidTimestamp = 5,
    InvalidUpdateLength = 6,
    AssetLimitExceeded = 7
}
```