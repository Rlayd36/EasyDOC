package com.easydoc.controller;

import com.easydoc.service.ForgotPasswordService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5173", allowedHeaders = "*")
public class ForgotPasswordController {

	private final ForgotPasswordService forgotPasswordService;

	/**
	비밀번호 재설정 요청.
	 */
	@PostMapping("/forgot-password")
	public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
		String email = body != null ? body.get("email") : null;
		var optToken = forgotPasswordService.requestReset(email);
		if (optToken.isPresent()) {
			return ResponseEntity.ok(Map.of("token", optToken.get()));
		}
		return ResponseEntity.badRequest().body("등록된 이메일이 없거나 요청을 처리할 수 없습니다.");
	}

	/**
	 * 토큰으로 비밀번호 재설정.
	 */
	@PostMapping("/reset-password")
	public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
		if (body == null) {
			return ResponseEntity.badRequest().body("token과 newPassword가 필요합니다.");
		}
		String token = body.get("token");
		String newPassword = body.get("newPassword");
		if (newPassword != null && newPassword.length() < 8) {
			return ResponseEntity.badRequest().body("비밀번호는 8자 이상이어야 합니다.");
		}
		boolean ok = forgotPasswordService.resetPassword(token, newPassword);
		if (ok) {
			return ResponseEntity.ok(Map.of("ok", true));
		}
		return ResponseEntity.badRequest().body("토큰이 유효하지 않거나 만료되었습니다.");
	}
}
