package com.easydoc.repository;

import com.easydoc.entity.UserInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserInfoRepository extends JpaRepository<UserInfo, Long> {

	Optional<UserInfo> findByResetToken(String resetToken);

	List<UserInfo> findByEmail(String email);

	@Modifying
	@Query("DELETE FROM UserInfo u WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(:email))")
	void deleteByEmailNormalized(@Param("email") String email);
}
