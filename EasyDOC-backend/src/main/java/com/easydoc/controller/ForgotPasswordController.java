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

	private static final String FORGOT_OK_MESSAGE = "이메일이 등록되어 있으면 비밀번호 재설정 안내를 보냈습니다.";

	private final ForgotPasswordService forgotPasswordService;

	/**
	비밀번호 재설정 요청.
	 */
	@PostMapping("/forgot-password")
	public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
		String email = body != null ? body.get("email") : null;
		if (email == null || email.isBlank() || !email.contains("@")) {
			return ResponseEntity.badRequest().body("유효한 이메일을 입력하세요.");
		}
		try {
			forgotPasswordService.requestReset(email);
		} catch (RuntimeException e) {
			return ResponseEntity.internalServerError().body("메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
		}
		// enumeration(이메일 존재 여부 추정) 완화: 항상 동일 응답
		return ResponseEntity.ok(Map.of("ok", true, "message", FORGOT_OK_MESSAGE));
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
