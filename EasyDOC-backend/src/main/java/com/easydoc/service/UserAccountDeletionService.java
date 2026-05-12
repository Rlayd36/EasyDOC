package com.easydoc.service;

import com.easydoc.entity.User;
import com.easydoc.repository.UserInfoRepository;
import com.easydoc.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserAccountDeletionService {

	private final UserRepository userRepository;
	private final UserInfoRepository userInfoRepository;
	private final JdbcTemplate jdbcTemplate;

	/**
	 * users 행 삭제 전, 동일 DB의 문서 이력(docsinfos)·비밀번호 재설정(userinfos)을 같은 이메일 기준으로 제거한다.
	 */
	@Transactional
	public boolean deleteAccountByEmail(String email) {
		if (email == null || email.isBlank()) {
			return false;
		}
		Optional<User> opt = userRepository.findByEmail(email.trim());
		if (opt.isEmpty()) {
			return false;
		}
		User user = opt.get();
		String key = user.getEmail().trim();
		jdbcTemplate.update(
				"DELETE FROM docsinfos WHERE LOWER(TRIM(COALESCE(user_email,''))) = LOWER(TRIM(?))",
				key);
		userInfoRepository.deleteByEmailNormalized(key);
		userRepository.delete(user);
		return true;
	}
}
