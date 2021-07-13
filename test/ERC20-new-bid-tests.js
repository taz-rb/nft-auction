const { expect } = require("chai");
const { ethers } = require("hardhat");

const { BigNumber } = require("ethers");
// Enable and inject BN dependency

const tokenId = 1;
const minPrice = 100;
const newMinPrice = 50;
const tokenBidAmount = 250;
const tokenAmount = 500;
const auctionBidPeriod = 86400; //seconds
const bidIncreasePercentage = 10;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const zeroERC20Tokens = 0;

// Deploy and create a mock erc721 contract.

describe("ERC20 New Bid Tests", function () {
  let ERC721;
  let erc721;
  let ERC20;
  let erc20;
  let otherErc20;
  let NFTAuction;
  let nftAuction;
  let contractOwner;
  let user1;
  let user2;
  let user3;

  beforeEach(async function () {
    ERC721 = await ethers.getContractFactory("ERC721MockContract");
    ERC20 = await ethers.getContractFactory("ERC20MockContract");
    NFTAuction = await ethers.getContractFactory("NFTAuction");
    [ContractOwner, user1, user2, user3] = await ethers.getSigners();

    erc721 = await ERC721.deploy("my mockables", "MBA");
    await erc721.deployed();
    await erc721.mint(user1.address, 1);

    erc20 = await ERC20.deploy("Mock ERC20", "MER");
    await erc20.deployed();
    await erc20.mint(user1.address, tokenAmount);
    await erc20.mint(user2.address, tokenAmount);

    await erc20.mint(user3.address, tokenAmount);

    otherErc20 = await ERC20.deploy("OtherToken", "OTK");
    await otherErc20.deployed();

    await otherErc20.mint(user2.address, tokenAmount);

    nftAuction = await NFTAuction.deploy();
    await nftAuction.deployed();
    //approve our smart contract to transfer this NFT
    await erc721.connect(user1).approve(nftAuction.address, tokenId);
    await erc20.connect(user1).approve(nftAuction.address, tokenAmount);
    await erc20.connect(user2).approve(nftAuction.address, tokenBidAmount);
    await erc20.connect(user3).approve(nftAuction.address, tokenAmount);
  });

  describe("Test make bids and bid requirements", function () {
    beforeEach(async function () {
      await nftAuction
        .connect(user1)
        .createNewNftAuction(
          erc721.address,
          tokenId,
          erc20.address,
          minPrice,
          auctionBidPeriod,
          bidIncreasePercentage
        );
    });
    // 1 basic test, NFT put up for auction can accept bids with ETH
    it("Calling makeBid to bid on new NFTAuction with ERC20", async function () {
      await nftAuction
        .connect(user2)
        .makeBid(erc721.address, tokenId, erc20.address, minPrice);
      let result = await nftAuction.nftContractAuctions(
        erc721.address,
        tokenId
      );
      expect(result.nftHighestBidder).to.equal(user2.address);
      expect(result.nftHighestBid.toString()).to.be.equal(
        BigNumber.from(minPrice).toString()
      );
    });
    it("should ensure owner cannot bid on own NFT", async function () {
      await expect(
        nftAuction
          .connect(user1)
          .makeBid(erc721.address, tokenId, erc20.address, minPrice)
      ).to.be.revertedWith("Owner cannot bid on own NFT");
    });
    it("should ensure bidder cannot bid with eth and tokens", async function () {
      await expect(
        nftAuction
          .connect(user2)
          .makeBid(erc721.address, tokenId, erc20.address, minPrice, {
            value: minPrice,
          })
      ).to.be.revertedWith(
        "Bid to be made in quantities of specified token or eth"
      );
    });

    it("should not allow bid lower than minimum bid percentage", async function () {
      nftAuction
        .connect(user2)
        .makeBid(erc721.address, tokenId, erc20.address, minPrice);
      await expect(
        nftAuction
          .connect(user3)
          .makeBid(
            erc721.address,
            tokenId,
            erc20.address,
            (minPrice * 101) / 100
          )
      ).to.be.revertedWith("Bid must be % more than previous highest bid");
    });

    it("should allow for new bid if higher than minimum percentage", async function () {
      await nftAuction
        .connect(user2)
        .makeBid(erc721.address, tokenId, erc20.address, minPrice);
      const bidIncreaseByMinPercentage =
        (minPrice * (100 + bidIncreasePercentage)) / 100;
      await nftAuction
        .connect(user3)
        .makeBid(
          erc721.address,
          tokenId,
          erc20.address,
          bidIncreaseByMinPercentage
        );
      let result = await nftAuction.nftContractAuctions(
        erc721.address,
        tokenId
      );
      expect(result.nftHighestBidder).to.equal(user3.address);
      expect(result.nftHighestBid.toString()).to.be.equal(
        BigNumber.from(bidIncreaseByMinPercentage).toString()
      );
    });
    it("should not allow owner to withdraw NFT if valid bid made", async function () {
      await nftAuction
        .connect(user2)
        .makeBid(erc721.address, tokenId, erc20.address, minPrice);
      await expect(
        nftAuction.connect(user1).withdrawNft(erc721.address, tokenId)
      ).to.be.revertedWith("The auction has a valid bid made");
    });
    it("should not allow bidder to withdraw if min price exceeded", async function () {
      await nftAuction
        .connect(user2)
        .makeBid(erc721.address, tokenId, erc20.address, minPrice);
      await expect(
        nftAuction.connect(user2).withdrawBid(erc721.address, tokenId)
      ).to.be.revertedWith("The auction has a valid bid made");
    });

    it("should allow bidder to specify NFT recipient", async function () {
      await nftAuction
        .connect(user2)
        .makeCustomBid(
          erc721.address,
          tokenId,
          erc20.address,
          minPrice,
          user3.address
        );
      let result = await nftAuction.nftContractAuctions(
        erc721.address,
        tokenId
      );
      expect(result.nftRecipient).to.be.equal(user3.address);
      expect(result.nftHighestBid.toString()).to.be.equal(
        BigNumber.from(minPrice).toString()
      );
    });
    it("should not allow user to bid with another ERC20 token", async function () {
      await expect(
        nftAuction
          .connect(user2)
          .makeCustomBid(
            erc721.address,
            tokenId,
            otherErc20.address,
            minPrice,
            user3.address
          )
      ).to.be.revertedWith(
        "Bid to be made in quantities of specified token or eth"
      );
    });
    // test for full functionality of makeBid still needed
  });
  describe("Test underbid functionality", function () {
    let underBid = minPrice - 10;
    let result;
    let user1BalanceBeforePayout;
    beforeEach(async function () {
      await nftAuction
        .connect(user1)
        .createNewNftAuction(
          erc721.address,
          tokenId,
          erc20.address,
          minPrice,
          auctionBidPeriod,
          bidIncreasePercentage
        );
      await nftAuction
        .connect(user2)
        .makeBid(erc721.address, tokenId, erc20.address, underBid);
      result = await nftAuction.nftContractAuctions(erc721.address, tokenId);
      user1BalanceBeforePayout = await user2.getBalance();
    });
    it("should allow underbidding", async function () {
      expect(result.nftHighestBidder).to.be.equal(user2.address);
      expect(result.nftHighestBid.toString()).to.be.equal(
        BigNumber.from(underBid).toString()
      );
    });
    it("should not commence the auction", async function () {
      expect(result.auctionEnd).to.be.equal(BigNumber.from(0).toString());
    });
    it("should set a minimum price", async function () {
      expect(result.minPrice).to.be.equal(BigNumber.from(minPrice).toString());
    });
    it("should reset bids when bidder withdraws funds", async function () {
      await nftAuction.connect(user2).withdrawBid(erc721.address, tokenId);
      result = await nftAuction.nftContractAuctions(erc721.address, tokenId);
      expect(result.nftHighestBidder).to.be.equal(zeroAddress);
    });
    it("should transfer the correct amount to the bidder if they withdraw", async function () {
      expect(await erc20.balanceOf(user2.address)).to.equal(
        BigNumber.from(tokenAmount - underBid).toString()
      );
      await nftAuction.connect(user2).withdrawBid(erc721.address, tokenId);
      result = await nftAuction.nftContractAuctions(erc721.address, tokenId);
      expect(result.nftHighestBidder).to.be.equal(zeroAddress);
      expect(await erc20.balanceOf(user2.address)).to.equal(
        BigNumber.from(tokenAmount).toString()
      );
    });
    it("should not allow other users to withdraw underbid", async function () {
      await expect(
        nftAuction.connect(user3).withdrawBid(erc721.address, tokenId)
      ).to.be.revertedWith("Cannot withdraw funds");
    });
    it("should allow seller to lower minimum price and start the auction", async function () {
      await nftAuction
        .connect(user1)
        .updateMinimumPrice(erc721.address, tokenId, newMinPrice);
      let result = await nftAuction.nftContractAuctions(
        erc721.address,
        tokenId
      );
      expect(result.auctionEnd.toString()).to.be.not.equal(
        BigNumber.from(0).toString()
      );
    });
    it("should allow seller to update price above current bid and not start the auction", async function () {
      await nftAuction
        .connect(user1)
        .updateMinimumPrice(erc721.address, tokenId, underBid + 5);
      let result = await nftAuction.nftContractAuctions(
        erc721.address,
        tokenId
      );

      expect(result.auctionEnd.toString()).to.be.equal(
        BigNumber.from(0).toString()
      );
      expect(result.nftHighestBid.toString()).to.be.equal(
        BigNumber.from(underBid).toString()
      );
    });
  });
  describe("Test early bids with erc20 auctions", async function () {
    it("not allow early bids with ERC20 tokens", async function () {
      await expect(
        nftAuction
          .connect(user2)
          .makeBid(erc721.address, tokenId, erc20.address, minPrice)
      ).to.be.revertedWith(
        "Bid to be made in quantities of specified token or eth"
      );
    });
  });
});