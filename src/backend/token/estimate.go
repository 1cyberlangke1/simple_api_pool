package token

func estimateUsage(body []byte, estimateEnabled bool) Usage {
	if !estimateEnabled || len(body) == 0 {
		return Usage{}
	}

	totalTokens := int64(len(body) / 4)
	if totalTokens < 1 {
		totalTokens = 1
	}

	return Usage{
		InputTokens:  totalTokens / 2,
		OutputTokens: totalTokens - totalTokens/2,
	}
}
