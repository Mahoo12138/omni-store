// Package auth 负责登录、Session、Cookie、密码哈希、Token 哈希和 CSRF。
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

// HashPassword 使用 bcrypt 哈希密码。禁止明文存储（README §8.3）。
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("密码哈希失败: %w", err)
	}
	return string(b), nil
}

// VerifyPassword 校验密码与 bcrypt 哈希是否匹配。
func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// NewRandomToken 生成 nBytes 随机数的十六进制 Token，可带前缀。
func NewRandomToken(prefix string, nBytes int) string {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand 不可用: " + err.Error())
	}
	return prefix + hex.EncodeToString(b)
}

// NewPublicID 生成 "{prefix}_{8位小写字母数字}" 形式的稳定随机 ID，
// 例如 u_7k3f9a2d。
func NewPublicID(prefix string) string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand 不可用: " + err.Error())
	}
	out := make([]byte, 8)
	for i, v := range b {
		out[i] = alphabet[int(v)%len(alphabet)]
	}
	return prefix + "_" + string(out)
}

// HashToken 对 Token 做 SHA-256，数据库只保存哈希（README §8.6/§8.7）。
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// TokenEqual 恒定时间比较 Token 哈希。
func TokenEqual(hashA, hashB string) bool {
	return subtle.ConstantTimeCompare([]byte(hashA), []byte(hashB)) == 1
}
