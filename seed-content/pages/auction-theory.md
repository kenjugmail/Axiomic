---
title: Auction Theory
category: game-theory
---
<!-- tier:intro -->
# Auction Theory

**Auction theory** is the branch of [[mechanism-design]] dealing with allocation of scarce items to bidders with private valuations.

The four classical auction formats:
1. **English** (ascending): bidders raise bids until one stays.
2. **Dutch** (descending): price starts high, falls until someone accepts.
3. **First-price sealed-bid**: highest bid wins, pays their bid.
4. **Second-price sealed-bid (Vickrey)**: highest bid wins, pays the second-highest bid.

**Revenue equivalence theorem** (Myerson 1981): under standard assumptions (private values, risk-neutral bidders, IID valuations), all four formats yield the same expected revenue to the seller.

The **Vickrey** auction is special: bidding your true valuation is a *dominant strategy*. No analysis of opponents needed.

<!-- tier:undergrad -->
# Auction Theory (Undergrad)

## First-price (sealed-bid)

Each bidder submits a bid; highest wins, pays their bid. Bidders **shade**: bid below their valuation to leave surplus on winning. With $n$ bidders and uniform $[0,1]$ valuations, equilibrium bid: $b_i(v_i) = \frac{n-1}{n} v_i$.

## Second-price (Vickrey)

Same auction except winner pays second-highest bid. **Truthfulness theorem**: regardless of others' strategies, your payoff is maximized by bidding your true valuation. Proof: bidding below risks losing when you'd profit; bidding above risks winning when you'd lose money. Bidding truthfully is a *weakly dominant* strategy.

This is the simplest case of the [[vcg-auction]] generalization.

## English vs Dutch — strategic equivalence

- **English ↔ Vickrey**: in an English auction with private values, you should drop out exactly when the price reaches your valuation (so no one outbids except those with higher valuations). The winning price = second-highest valuation. Same outcome as Vickrey.
- **Dutch ↔ first-price**: identical strategically. Bidder "accepts" at the price they'd have bid in a sealed-bid first-price auction.

## Online ad auctions

Modern ad auctions (Google, Meta, Amazon) descend from VCG but with crucial differences:
- **Generalized second-price (GSP)** historically: bidder pays the next-highest bid for their slot. Not truthful; advertisers run sophisticated bidding strategies.
- **VCG-based**: more recent moves toward true VCG. Still strategic but theoretically cleaner.
- **Reserve prices**: optimal reserves (Myerson 1981) extract more revenue than zero reserves, even when efficiency drops.

<!-- tier:grad -->
# Auction Theory (Grad)

## Myerson's optimal auction

Myerson (1981) characterized the **revenue-maximizing** auction: it allocates to the bidder with highest "virtual valuation" (a transformation of their bid that incorporates the prior distribution), reserving when no virtual valuation exceeds zero.

Key insight: the optimal auction sacrifices some efficiency for revenue. The optimal reserve price exceeds zero even when raising it costs efficiency.

## Combinatorial auctions

When bidders bid on bundles (substitutes, complements), the **winner determination problem** is NP-hard. VCG remains truthful but loses revenue properties; the core may be empty.

Spectrum auctions (FCC, Ofcom, ACMA) and computational ad auctions are the main applications. Approximate truthful mechanisms (Lehmann et al.) trade off efficiency vs incentive compatibility.

## Connection to ML

ML-based bidding in real-time ad auctions: agents learn to bid by RL, treating the auction as an MDP. The classical mechanism-design analysis assumes equilibrium bidders; reality is bidders learning over time. **Generalized first-price auctions** (used by Meta in 2018+) have rich strategic dynamics — multi-agent RL ([[multi-agent-rl]]) is the operative framework.
