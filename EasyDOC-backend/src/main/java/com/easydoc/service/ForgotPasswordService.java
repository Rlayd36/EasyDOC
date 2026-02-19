package com.easydoc.service;

import com.easydoc.entity.User;
import com.easydoc.entity.UserInfo;
import com.easydoc.repository.UserInfoRepository;
import com.easydoc.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ForgotPasswordService {

	private final UserRepository userRepository;
	private final UserInfoRepository userInfoRepository;
	private final PasswordEncoder passwordEncoder;

	private static final int TOKEN_VALID_MINUTES = 30;

	
	@Transactional
	public Optional<String> requestReset(String email) {
		if (email == null || email.isBlank()) {
			return Optional.empty();
		}
		String trimmedEmail = email.trim().toLowerCase();
		if (userRepository.findByEmail(trimmedEmail).isEmpty()) {
			return Optional.empty();
		}
		// 기존 같은 이메일 토큰은 삭제
		userInfoRepository.findByEmail(trimmedEmail).forEach(userInfoRepository::delete);

		String token = UUID.randomUUID().toString().replace("-", "");
		UserInfo info = new UserInfo();
		info.setEmail(trimmedEmail);
		info.setResetToken(token);
		info.setExpiresAt(LocalDateTime.now().plusMinutes(TOKEN_VALID_MINUTES));
		userInfoRepository.save(info);
		return Optional.of(token);
	}

	/**
	 * 토큰 + 새 비밀번호로 재설정. 토큰 유효하면 users 비밀번호 갱신하고 userinfos 행 삭제ㅇㅇ.
	 */
	@Transactional
	public boolean resetPassword(String token, String newPassword) {
		if (token == null || token.isBlank() || newPassword == null || newPassword.length() < 8) {
			return false;
		}
		Optional<UserInfo> opt = userInfoRepository.findByResetToken(token.trim());
		if (opt.isEmpty()) {
			return false;
		}
		UserInfo info = opt.get();
		if (LocalDateTime.now().isAfter(info.getExpiresAt())) {
			userInfoRepository.delete(info);
			return false;
		}
		Optional<User> userOpt = userRepository.findByEmail(info.getEmail());
		if (userOpt.isEmpty()) {
			userInfoRepository.delete(info);
			return false;
		}
		User user = userOpt.get();
		user.setPassword(passwordEncoder.encode(newPassword));
		userRepository.save(user);
		userInfoRepository.delete(info);
		return true;
	}
}
