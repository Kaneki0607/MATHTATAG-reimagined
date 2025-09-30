// ElevenLabs API Keys Management
// This file manages the API keys for ElevenLabs TTS service
// Keys with credits below 300 will be automatically removed

export interface ApiKeyInfo {
  key: string;
  addedAt: Date;
  lastUsed?: Date;
  creditsRemaining?: number;
  status: 'active' | 'low_credits' | 'expired' | 'failed';
}

// In-memory storage for API keys
let apiKeys: ApiKeyInfo[] = [
  {
    key: "sk_4eb0b7451a57aca5b342bc803e81117759dd16a64115474f",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_57b2f7ade082787cd0f3daedbd9be4d9d1a0b3c8c374b92e",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_44bc790290208dcf327cc264fc303fd19dfcbcf2503fff5b",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_734f4f109a35691098606fdfa04d26aadc39888cb7b99104",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_727ff916d4ba73a8ca7a85327e34dbfaec654e35007adcb1",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_1389a8cd23bb5319baac03fa262bbf5e0756b1d90a23c33c",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_ffb922d371c100cbd18f4d544f2559bb8a160cd33e8d6310",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_3450730ed79301170d35feba40a09fcc06e5a7c723d7bbd9",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_e825766782ef4dc78cbfbdafb39278ba1ae1f15301c6e634",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_005a75a007178e7832e54766aa7ecb2e582042b001dc3e07",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_3940d01c39260573630ac0a6dbb8f5fa9710b14a1e09e5e6",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_d3f2bc37200171c5457215ad0478ed7abd403aaa108f6c94",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_ba6c1302fd3ff43cfdb22e31fe9e8db1db9ec63b42a2a5e7",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_b7bbfaacba7aeaafac980d647fcc6fe261684ae70dc5aea6",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_f4da1773feb482ea17e740b0287f5defd7378862fb3ce736",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_83f2bf46fe15cf17424eb18cfd18ea87ecc6ebcb4ae7c2e9",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_7cbc4b64102087d8d48420cb2390b6fbef968f57f80e445a",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_280f2b75da4c140bc5157f3c4ce4edceb81f2ac6d339b723",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_87039a20ae7d2856b5b0f2ebba254d4c2babdaaff8d5403b",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_189e44f21a9f315886fbce19151664b595d56adc05b48e56",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_db3d1ce67b22d2f324c0f9afc4464dea48f739b932a849e7",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_702c741a7f10c69284037b389abce9587aa0b2e48ac152af",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_8987d4f30865e2fe1de1b958207e5e974e8236e9929dadbb",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_9a1d5a8f3f3e7f05d7fa63f9735ea610c229d0972f8246dc",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_37cdab134b584c2f61889251e31b73644245fb34d02727a6",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_eeabae4e90fafc33c37c3cca14993867aadbb4628141a381",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_ea810af153330fea98e1c45b1ebb05af379502015b0b7fe2",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_1b9c17e52d7131bee5e1c96e260fd70287be263c76e99ebe",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_81f3d1c4c566fc7c64540af6fd1ce395729507a7387fa593",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_3ac8dd470b2b7901e3da46048b8c031018d03c6cec2f747a",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_2ad9582f4f7a5cc9c2ef88a9a09785e78a7a8d7b67b0adb1",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_5996aa048df0d92e7a618ad8219fdd36c16c8b401a0a5e7b",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_7cfbb2f5455065987753ac8f9255207e55ed4d26dad607e1",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_66f1eeacb7497b542942167ea3019f30eccfc17be5933949",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_b1621c1f7670d743e1b74878cc03421f5852d96d03a765e7",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_d25b57689e2ed1b33d336afaeb2c40b9a9c8c7b1871a02e6",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_962a92479e7dc2d243cc28acdd4522686bc991f6508d7568",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_cb4b7adf2b5763934589582b9fa702f398146bb251b87ac7",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_988e2dad1d73d5da1422632b66c2dbf20f7cfe871a80ed77",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_9ab593354999a11844576fb0d14f70077475eeb3246471b6",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_e2d8be7cfb0b56ab8c1e5ad3467f134e57093f315d50bcd1",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_cc5501fd9ab2fbc8ce0c0297bcc29b7a2ee92b2ed0e8abb2",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_deeeb64ee4cbf30ad24b660ed8a9560157a16de6b87fcdb7",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_47597362e0fb469d4a2c7491f7eda27f05583bd494e16039",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_a533d10e4eff257e48026570250178ff852e07f56bf9042a",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4c7491bb293f2480dfce28ca584e93a5252f1a8dd6367196",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_60191e943088767dc7f1b30222578a32bbbb81cdf24fd006",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_eb53ab8c9c2a687fe4832f3c4b933112f6b5402fb7c52ada",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_1e331b0713237dfde66eaf25fb10ce97f06e156a217e14ad",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_bbcde05cafb93687221e67985fda84a5ac1bcb18ac274e3b",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_26573cfed8b9cd6d5281690a8fcb53cec2101fafdbc6a9b6",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_c39f40535508f6875058f77689bce129958ce6245899e86a",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_06729e7ff769cfb34dd36192e9f0c656f3bfdd307e67e369",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4174398fed67e81abbc9a4df16a3489a83acb2e0130ddc22",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_7c6375dd9e56305a7658a2959fca6f1e8aac9d0c5cb0fe58",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_c19bbb2c7b0822593f3a943772f1779734dbac4e457d7c90",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_cbf7f3caedc8d3c49e04b0e3d7fbf578ab5216275ef22471",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_e813113859a4db900c70d70e498e73f99a043a21715215a7",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_7f6333f6de0700bbce504d1e69c1873073f0dd40e7b225bc",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_1854350b76610117d46a1591fc617ad39431e1d65a9ae2bd",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_1322def75770aba4ed62d37e417a40d853704181e75ed022",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_75451868e93da829aa7138dbab9d96cd33a83e7e3744b970",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_2cede625314247420c628e93d8ce7e62a472feb992676967",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4157d0dddc83e38a1c3506725ce67620d634d92931531554",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4278ae1d2b31bb2bb243d6faf3e65900cff0781e0c5ed8cc",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_30991c948c8e809f4855c85e22cccd7ff9678b20bed81f32",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_e60f307424ff02a8e30d6becb345c8741bbbd17e2dc302d9",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_2b2680ef3c6691990d59c652cb38ad3ed270828f6291a3f0",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4d01ddd0f04cf3d65fab3e36388292d85684aa252a3f3c57",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_8735eb453483eed18f641cadd62571990435624ee8572190",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_dd368b5ea4dd6cf7f5a026764ca9fd73d0375f1066cf7cc9",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_2df1a8d7049b7b5b09248fc23081900056c0cec1172f3e33",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_b08c7c0c54418ed7883cd067f2b37fca048ad0fabd6ece68",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_a7a62fdb3f98749efdd4083b924954842fae0d581de999d3",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_22b1f3ceee2145cb2727477501955f17c6d7e4d52b448427",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_52308985e50b193901cf483f9890f61beb744a59d637d195",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_f7a0658002d03b76e85746f32928312f472cd0f281d2b539",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_22fe6fe0bfc1a0f151289a0b4ddcb4ba674bbdd35ce658cb",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_0280116d56e26349faab53dc47a20897062836d234d5b097",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_4b624075f8d656663db093c26233d48214d24b0529e326b2",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_96646b09cee1732d970925dce28aff359d12058ed6ab74bd",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_cf4978013b49de6081cbefbe5fffc8b5f65e760dec3428ce",
    addedAt: new Date(),
    status: 'active'
  },
  {
    key: "sk_e58b058baf46063de7cd1295ca418f365f8a20ff4c1864cd",
    addedAt: new Date(),
    status: 'active'
  }
];

// Get all active API keys
export const getActiveApiKeys = (): string[] => {
  return apiKeys
    .filter(keyInfo => keyInfo.status === 'active')
    .map(keyInfo => keyInfo.key);
};

// Get API key status
export const getApiKeyStatus = () => {
  return {
    totalKeys: apiKeys.length,
    activeKeys: apiKeys.filter(k => k.status === 'active').length,
    lowCreditKeys: apiKeys.filter(k => k.status === 'low_credits').length,
    expiredKeys: apiKeys.filter(k => k.status === 'expired').length,
    failedKeys: apiKeys.filter(k => k.status === 'failed').length,
    keys: apiKeys.map((keyInfo, index) => ({
      index: index + 1,
      key: keyInfo.key.substring(0, 10) + '...',
      status: keyInfo.status,
      addedAt: keyInfo.addedAt,
      lastUsed: keyInfo.lastUsed,
      creditsRemaining: keyInfo.creditsRemaining
    }))
  };
};

// Add a new API key
export const addApiKey = (newKey: string): boolean => {
  if (!newKey.startsWith('sk_')) {
    console.warn('⚠️ API key should start with "sk_" for ElevenLabs');
    return false;
  }
  
  // Check if key already exists
  if (apiKeys.some(keyInfo => keyInfo.key === newKey)) {
    console.warn('⚠️ API key already exists in the list');
    return false;
  }
  
  apiKeys.push({
    key: newKey,
    addedAt: new Date(),
    status: 'active'
  });
  
  console.log(`✅ Added new API key. Total keys: ${apiKeys.length}`);
  return true;
};

// Mark API key as used
export const markApiKeyAsUsed = (key: string): void => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    keyInfo.lastUsed = new Date();
  }
};

// Update API key credits and status
export const updateApiKeyCredits = (key: string, creditsRemaining: number): void => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    keyInfo.creditsRemaining = creditsRemaining;
    
    if (creditsRemaining < 300) {
      keyInfo.status = 'low_credits';
      console.log(`🗑️ Marking API key as low credits (${creditsRemaining} < 300): ${key.substring(0, 10)}...`);
    } else {
      keyInfo.status = 'active';
    }
  }
};

// Remove API key with low credits
export const removeLowCreditKeys = (): number => {
  const initialCount = apiKeys.length;
  apiKeys = apiKeys.filter(keyInfo => keyInfo.status !== 'low_credits');
  const removedCount = initialCount - apiKeys.length;
  
  if (removedCount > 0) {
    console.log(`🗑️ Removed ${removedCount} API keys with low credits. Remaining: ${apiKeys.length}`);
  }
  
  return removedCount;
};

// Mark API key as failed
export const markApiKeyAsFailed = (key: string): void => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    keyInfo.status = 'failed';
    console.log(`❌ Marked API key as failed: ${key.substring(0, 10)}...`);
  }
};

// Get next available API key
export const getNextApiKey = (): string | null => {
  const activeKeys = apiKeys.filter(keyInfo => keyInfo.status === 'active');
  if (activeKeys.length === 0) {
    console.error('❌ No active API keys available!');
    return null;
  }
  
  // Return the first active key
  return activeKeys[0].key;
};

// Clean up expired keys (older than 30 days)
export const cleanupExpiredKeys = (): number => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const initialCount = apiKeys.length;
  apiKeys = apiKeys.filter(keyInfo => {
    if (keyInfo.addedAt < thirtyDaysAgo && keyInfo.status !== 'active') {
      return false;
    }
    return true;
  });
  
  const removedCount = initialCount - apiKeys.length;
  if (removedCount > 0) {
    console.log(`🧹 Cleaned up ${removedCount} expired API keys`);
  }
  
  return removedCount;
};

// Debug function to check a specific key's status
export const debugKeyStatus = (key: string) => {
  const keyInfo = apiKeys.find(k => k.key === key);
  if (keyInfo) {
    console.log(`🔍 Key Status Debug:`, {
      key: key.substring(0, 10) + '...',
      status: keyInfo.status,
      creditsRemaining: keyInfo.creditsRemaining,
      addedAt: keyInfo.addedAt,
      lastUsed: keyInfo.lastUsed
    });
    return keyInfo;
  } else {
    console.log(`❌ Key not found: ${key.substring(0, 10)}...`);
    return null;
  }
};
