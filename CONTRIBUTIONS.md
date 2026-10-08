# CONTRIBUTIONS

## Thông tin

| Hạng mục | Nội dung |
|---|---|
| Đề tài | CredVerify — Hệ thống cấp phát, xác minh và thu hồi chứng chỉ khóa học trên blockchain |
| Hình thức | Cá nhân |
| Họ và tên | Tạ Minh Đức |
| Giảng viên hướng dẫn | Trần Tuấn Dũng |
| Repository | https://github.com/smileplayer/credverify |

## Tuyên bố đóng góp

Đề tài được đăng ký và thực hiện theo hình thức cá nhân. Toàn bộ 100% khối lượng công việc do
sinh viên nêu trên tự thực hiện, bao gồm: khảo sát vấn đề, nghiên cứu tài liệu, thiết kế kiến
trúc, viết smart contract, viết bộ kiểm thử, xây dựng giao diện, thu thập bằng chứng, viết báo
cáo và chuẩn bị trình bày.

## Sử dụng công cụ hỗ trợ

Sinh viên có sử dụng công cụ hỗ trợ trong quá trình thực hiện. Kê khai đầy đủ:

| Công cụ | Mục đích sử dụng | Phạm vi |
|---|---|---|
| **Trợ lý AI (mô hình ngôn ngữ)** | Rà soát bảo mật đối kháng; phản biện thiết kế; sinh mã nháp cho contract, test và giao diện | Xuyên suốt đề tài. |
| Hardhat + solidity-coverage | Biên dịch, kiểm thử, đo độ phủ | `npx hardhat test`, `npx hardhat coverage` |
| Slither 0.11.6 | Phân tích tĩnh smart contract | `npm run slither` |
| MetaMask | Kiểm thử luồng ghi bằng ví thật | Ảnh chụp giao diện V2 đã gỡ; chụp lại trên bản Sepolia |

Sinh viên chịu trách nhiệm kiểm chứng toàn bộ nội dung. **Không có nội dung nào do công cụ sinh
ra được sử dụng như một nguồn tài liệu tham khảo.** Mọi trích dẫn trong báo cáo đều dẫn tới nguồn
gốc có thể kiểm chứng và đã được đối chiếu trực tiếp — các nguồn học thuật đều đã kiểm DOI resolve
về trang nhà xuất bản.

## Cam kết

Sinh viên cam kết:

- Toàn bộ số liệu trong báo cáo khớp với log và kết quả kiểm thử thực tế, **không có số liệu bịa đặt**. `EVIDENCE.md` được **sinh tự động** bởi `scripts/collect-evidence.js`; script tự chạy lại `npx hardhat test` và tự đọc `coverage.json` thay vì chép tay con số.
- Mọi bằng chứng trong `EVIDENCE.md` đều tái lập được theo hướng dẫn trong `README.md`.
- Không sao chép mã nguồn hoặc nội dung của người khác mà không ghi rõ nguồn và giấy phép.
- Không có private key, seed phrase hay dữ liệu cá nhân thật trong repository. Các địa chỉ ví trong bằng chứng là tài khoản mặc định của mạng Hardhat local, công khai theo thiết kế.
