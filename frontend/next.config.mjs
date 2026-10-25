/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Three.js to be bundled normally
  webpack(config) {
    // Stub out @base-org/account (pulls in @coinbase/cdp-sdk → @x402/* which don't exist)
    // We don't use Coinbase Smart Accounts — only injected wallets + MetaMask
    config.resolve.alias['@base-org/account'] = false;
    config.resolve.alias['@x402/evm'] = false;
    config.resolve.alias['@x402/svm/exact/client'] = false;
    return config;
  },
};

export default nextConfig;
